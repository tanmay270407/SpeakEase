import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle, ArrowRight, Clock, Activity, AlertCircle, MessageSquare, RotateCcw, ArrowLeft, Loader2, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { AudioPlayer } from "../../components/AudioPlayer";
import { PracticeLevelMeter } from "../../components/PracticeLevelMeter";
import { Button } from "../../components/ui/Button";
import { RateSLPModal } from "../../components/slp/RateSLPModal";
import { reviewService } from "../../services/reviewService";
import { connectionService } from "../../services/connectionService";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { formatDuration } from "../../lib/utils";
import { getExerciseDetailsById, ExerciseDetail } from "../../data/exerciseDetailsData";
import { ExerciseProgressTracker } from "../../components/ExerciseProgressTracker";

export function ExerciseResultPage() {
  const { exerciseId, sessionId } = useParams<{ exerciseId: string; sessionId: string }>();
  const { profile } = useAuth();
  const [exercise, setExercise] = useState<ExerciseDetail>(() => getExerciseDetailsById(exerciseId));
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [session, setSession] = useState<any>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [observation, setObservation] = useState<any>(null);
  const [clinicianNote, setClinicianNote] = useState<any>(null);
  const [activeSLP, setActiveSLP] = useState<any | null>(null);
  const [sessionReview, setSessionReview] = useState<any | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Sync exercise title from DB if available
  useEffect(() => {
    let isMounted = true;
    async function loadExercise() {
      if (!exerciseId) return;
      try {
        const { data } = await (supabase.from("exercises") as any)
          .select("id, name, description")
          .eq("id", exerciseId)
          .maybeSingle();

        if (data && isMounted) {
          setExercise(prev => ({
            ...prev,
            id: data.id,
            title: data.name || prev.title,
            clinicalPurpose: data.description || prev.clinicalPurpose,
          }));
        }
      } catch (err) {
        console.warn("Could not fetch exercise info:", err);
      }
    }
    loadExercise();
    return () => {
      isMounted = false;
    };
  }, [exerciseId]);

  const loadResults = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      if (!sessionId) throw new Error("No session ID provided.");

      const [sessionRes, metricsRes, obsRes, noteRes] = await Promise.all([
        (supabase.from("sessions") as any).select("*").eq("id", sessionId).single(),
        (supabase.from("speech_metrics") as any).select("*").eq("session_id", sessionId).maybeSingle(),
        (supabase.from("ai_observations") as any).select("*").eq("session_id", sessionId).maybeSingle(),
        (supabase.from("clinician_notes") as any).select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      ]);

      if (sessionRes.error) throw sessionRes.error;
      
      setSession(sessionRes.data);
      
      if (metricsRes.data) setMetrics(metricsRes.data.metrics || metricsRes.data);
      if (obsRes.data) setObservation(obsRes.data.observation_text || obsRes.data.observation);
      if (noteRes.data) setClinicianNote(noteRes.data);

      if (profile?.id) {
        const slpAssignment = await connectionService.getPatientActiveSLP(profile.id);
        setActiveSLP(slpAssignment?.slps || null);
      }

      if (sessionId) {
        const existingRev = await reviewService.getReviewForSession(sessionId);
        setSessionReview(existingRev);
      }

    } catch (err: any) {
      console.error(err);
      if (!silent) setError(err.message || "Failed to load exercise results.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();

    if (sessionId) {
      const channel = supabase
        .channel(`exercise_session_${sessionId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, () => {
          loadResults(true);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [sessionId]);

  const pollCountRef = useRef(0);

  // Auto-polling if exercise session is actively analyzing or saving in background
  useEffect(() => {
    const isAnalyzing = session?.analysis_status === 'analyzing' || session?.analysis_status === 'processing' || session?.analysis_status === 'saving';
    if (!isAnalyzing) {
      pollCountRef.current = 0;
      return;
    }

    const interval = setInterval(() => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 12) {
        clearInterval(interval);
        setSession((prev: any) => prev ? { ...prev, analysis_status: 'failed' } : prev);
        if (sessionId) {
          (supabase.from('sessions') as any).update({ analysis_status: 'failed' }).eq('id', sessionId).then(() => {});
        }
        return;
      }
      loadResults(true);
    }, 2000);

    return () => clearInterval(interval);
  }, [session?.analysis_status, sessionId]);

  const handleRetryAnalysis = async () => {
    if (!sessionId) return;
    try {
      setRetrying(true);
      setRetryError(null);
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) throw new Error("Not authenticated");

      const response = await fetch(`/api/sessions/${sessionId}/retry-analysis`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authSession.access_token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Speech analysis is temporarily unavailable.");
      }

      await loadResults();
    } catch (err: any) {
      console.error("Retry analysis error:", err);
      setRetryError(err.message || "Speech analysis is temporarily unavailable.");
    } finally {
      setRetrying(false);
    }
  };

  const handleAudioDurationLoaded = (audioDur: number) => {
    if (audioDur > 0) {
      const rounded = audioDur < 1 ? 1 : Math.round(audioDur);
      setSession((prev: any) => {
        if (!prev) return prev;
        if (prev.duration !== rounded) {
          (supabase.from("sessions") as any)
            .update({ duration: rounded })
            .eq("id", sessionId)
            .then(() => {})
            .catch((err: any) => console.warn("Failed to update session duration:", err));
          return { ...prev, duration: rounded };
        }
        return prev;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-sm text-slate-500">Loading exercise results...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
            <div>
              <h2 className="text-lg font-semibold text-red-900">Error Loading Exercise Results</h2>
              <p className="text-red-700">{error}</p>
            </div>
            <Link 
              to={`/exercises/${exercise.id}`} 
              className="mt-4 inline-flex h-10 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md items-center justify-center text-sm font-medium transition-colors bg-white"
            >
              Back to Exercise
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAnalyzing = retrying || session?.analysis_status === 'analyzing' || session?.analysis_status === 'processing' || session?.analysis_status === 'saving';
  const hasAnalysisCompleted = !isAnalyzing && (metrics !== null || session?.analysis_status === 'completed');
  const isAnalysisFailed = !isAnalyzing && !hasAnalysisCompleted;

  // Active Analyzing State (simple & clear, no fake Practice Level)
  if (isAnalyzing) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 space-y-8 animate-in fade-in duration-200">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center ring-8 ring-indigo-50/50">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Analysis in progress...
            </h1>
            <p className="text-slate-500 text-sm max-w-md">
              Analyzing exercise recording, calculating speech metrics, and updating your Practice Level.
            </p>
          </div>
        </div>

        <Card className="border-slate-200 shadow-sm bg-slate-50/50">
          <CardContent className="p-6 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-600">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>Recorded Duration: {session ? formatDuration(session.duration) : "00:00"}</span>
            </div>
            <p className="text-xs text-slate-400">
              This typically takes a few seconds. Results will update automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-200">
      {/* Exercise Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link 
          to={`/exercises/${exercise.id}`} 
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          id="exercise-results-back-link"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {exercise.title}
        </Link>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          Exercise Completed
        </span>
      </div>

      {/* Progress Flow Tracker: Shows Completed Results Step */}
      <ExerciseProgressTracker
        currentStep="results"
        onStepClick={(targetStep) => {
          if (targetStep === 'instructions') {
            window.location.href = `/exercises/${exercise.id}`;
          }
        }}
      />

      {/* Completion Header */}
      <div className="flex flex-col items-center text-center space-y-4 pb-2">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
          hasAnalysisCompleted 
            ? 'bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50' 
            : 'bg-amber-50 text-amber-600 ring-8 ring-amber-50/50'
        }`}>
          {hasAnalysisCompleted ? (
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          ) : (
            <AlertCircle className="w-8 h-8 text-amber-600" />
          )}
        </div>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {exercise.title} - Session Complete
          </h1>
          <p className="text-slate-500 text-sm">
            {hasAnalysisCompleted 
              ? "Your exercise recording has been analyzed and saved to your clinical history."
              : "Your voice recording was safely saved, but automated speech analysis could not be completed."}
          </p>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-slate-50 text-slate-600 rounded-md border border-slate-200">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Duration</p>
              {audioError ? (
                <p className="text-sm font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded mt-1 border border-amber-200">
                  Audio could not be saved.
                </p>
              ) : (
                <p className="text-2xl font-semibold text-slate-900">{session ? formatDuration(session.duration) : "00:00"}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-slate-50 text-slate-600 rounded-md border border-slate-200">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Speech Rate</p>
              <p className="text-2xl font-semibold text-slate-900">{metrics?.speech_rate ? Math.round(Number(metrics.speech_rate)) : "--"} <span className="text-sm font-normal text-slate-500">wpm</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dynamic Practice Level Meter: Rendered only after real analysis is completed */}
      {hasAnalysisCompleted && metrics && (
        <PracticeLevelMeter metrics={metrics} practiceLevel={session?.practice_level} />
      )}

      {/* Fluency Metrics Breakdown: Rendered only after real analysis is completed */}
      {hasAnalysisCompleted && metrics && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Fluency Metrics</CardTitle>
            <CardDescription>Automated speech parameters recorded for this routine.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              <div className="flex items-center justify-between py-3">
                <span className="text-slate-600 text-sm">Possible repetitions</span>
                <span className="font-semibold text-slate-900">{metrics.repetitions ?? 0}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-slate-600 text-sm">Pauses</span>
                <span className="font-semibold text-slate-900">{metrics.pauses ?? 0}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-slate-600 text-sm">Possible prolongations</span>
                <span className="font-semibold text-slate-900">{metrics.prolongations ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audio Playback Component */}
      <AudioPlayer 
        sessionId={sessionId!} 
        initialDuration={session?.duration} 
        onDurationLoaded={handleAudioDurationLoaded} 
        onError={(err) => setAudioError(err)}
      />

      {/* AI Clinical Observations */}
      {hasAnalysisCompleted && observation && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">AI Observation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700 leading-relaxed text-sm">
              "{observation}"
            </p>
          </CardContent>
        </Card>
      )}

      {/* Clinician Feedback */}
      {clinicianNote && (
        <Card className="border-teal-200 bg-teal-50/50 shadow-sm">
          <CardHeader className="pb-3 border-b border-teal-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-teal-800">
                <MessageSquare className="w-5 h-5 text-teal-600" />
                <CardTitle className="text-lg text-teal-950 font-semibold">Clinician Feedback</CardTitle>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                Reviewed by SLP
              </span>
            </div>
            <CardDescription className="text-teal-700 text-xs">
              Reviewed on {new Date(clinicianNote.created_at).toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-teal-950 leading-relaxed whitespace-pre-wrap text-sm font-normal">
              {clinicianNote.note}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Rate SLP Card if patient has connected SLP for this assigned exercise */}
      {activeSLP && (
        <Card className="border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-white shadow-xs">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl shrink-0">
                <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Rate Your Speech-Language Pathologist</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  How was your experience working with <strong className="text-slate-900">{activeSLP.full_name}</strong> on this assigned activity?
                </p>
                {sessionReview && (
                  <p className="text-xs font-semibold text-emerald-700 mt-1.5 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    You rated this experience {sessionReview.rating}/5 stars
                  </p>
                )}
              </div>
            </div>

            <Button
              onClick={() => setRateModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-9 px-4 shrink-0 shadow-2xs"
            >
              {sessionReview ? 'View Review' : 'Rate SLP'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Rate SLP Modal */}
      {activeSLP && sessionId && (
        <RateSLPModal
          isOpen={rateModalOpen}
          onClose={() => setRateModalOpen(false)}
          slpId={activeSLP.id}
          slpName={activeSLP.full_name}
          slpTitle={activeSLP.professional_title}
          slpImage={activeSLP.profile_image}
          sessionId={sessionId}
          sessionTitle={exercise?.title ? `Assigned Exercise: ${exercise.title}` : 'Exercise Routine'}
          onSuccess={() => {
            loadResults(true);
          }}
        />
      )}

      {/* Failed Analysis Retry Section */}
      {isAnalysisFailed && (
        <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">
                    Speech analysis unavailable
                  </h3>
                  <p className="mt-1 text-xs text-amber-700">
                    Speech analysis could not be completed. Your session audio was securely saved and you can retry analysis now.
                  </p>
                  {retryError && (
                    <p className="mt-2 text-xs text-red-600 font-medium">{retryError}</p>
                  )}
                </div>
              </div>
              <Button
                onClick={handleRetryAnalysis}
                disabled={retrying}
                className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium shrink-0 gap-2 shadow-xs"
              >
                {retrying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    Retry Analysis
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Navigation: Remains strictly within Exercises or returns to Dashboard */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
        <Link 
          to={`/exercises/${exercise.id}`}
          className="w-full sm:w-auto inline-flex h-11 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full items-center justify-center gap-2 text-sm font-medium transition-colors shadow-sm"
          id="exercise-repeat-routine-btn"
        >
          <RotateCcw className="w-4 h-4" />
          Practice Routine Again
        </Link>
        <Link 
          to="/exercises"
          className="w-full sm:w-auto inline-flex h-11 px-6 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-full items-center justify-center gap-2 text-sm font-medium transition-colors bg-white"
          id="exercise-browse-all-btn"
        >
          All Exercises
        </Link>
        <Link 
          to="/dashboard"
          className="w-full sm:w-auto inline-flex h-11 px-6 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-full items-center justify-center gap-2 text-sm font-medium transition-colors bg-white"
          id="exercise-dashboard-btn"
        >
          Dashboard
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
