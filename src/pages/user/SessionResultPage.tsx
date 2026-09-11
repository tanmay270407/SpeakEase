import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle, ArrowRight, Clock, Activity, AlertCircle, MessageSquare, Loader2, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { AudioPlayer } from "../../components/AudioPlayer";
import { PracticeLevelMeter } from "../../components/PracticeLevelMeter";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";
import { formatDuration } from "../../lib/utils";

export function SessionResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [session, setSession] = useState<any>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [observation, setObservation] = useState<any>(null);
  const [clinicianNote, setClinicianNote] = useState<any>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const loadResults = async (silent: boolean = false) => {
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
      
      if (metricsRes.data) {
        setMetrics(metricsRes.data.metrics || metricsRes.data);
      } else {
        setMetrics(null);
      }

      if (obsRes.data) {
        setObservation(obsRes.data.observation_text || obsRes.data.observation);
      } else {
        setObservation(null);
      }

      if (noteRes.data) setClinicianNote(noteRes.data);

    } catch (err: any) {
      console.error(err);
      if (!silent) setError(err.message || "Failed to load session results.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, [sessionId]);

  // Auto-polling if session is actively analyzing or saving in background
  useEffect(() => {
    const isAnalyzing = session?.analysis_status === 'analyzing' || session?.analysis_status === 'processing' || session?.analysis_status === 'saving';
    if (!isAnalyzing) return;

    const interval = setInterval(() => {
      loadResults(true);
    }, 2500);

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
            .catch((err: any) => console.warn("Failed to update session duration in db:", err));
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
        <p className="text-sm text-slate-500">Loading session results...</p>
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
              <h2 className="text-lg font-semibold text-red-900">Error Loading Results</h2>
              <p className="text-red-700">{error}</p>
            </div>
            <Link to="/dashboard" className="mt-4 inline-flex h-10 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md items-center justify-center text-sm font-medium transition-colors bg-white">
              Return to Dashboard
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
              Analyzing your practice session...
            </h1>
            <p className="text-slate-500 text-sm max-w-md">
              Extracting speech metrics, acoustic parameters, and generating clinical observations.
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
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-8 animate-in fade-in duration-200">
      
      {/* Session Completion Header */}
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
            {hasAnalysisCompleted ? "Session Complete" : "Practice Session Recorded"}
          </h1>
          <p className="text-slate-500 text-sm">
            {hasAnalysisCompleted 
              ? "Your practice recording has been analyzed and saved to your clinical history."
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
              <p className="text-2xl font-semibold text-slate-900">
                {metrics?.speech_rate ? Math.round(Number(metrics.speech_rate)) : "--"} <span className="text-sm font-normal text-slate-500">wpm</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Practice Level Meter: Only rendered when real analysis succeeds */}
      {hasAnalysisCompleted && metrics && (
        <PracticeLevelMeter metrics={metrics} practiceLevel={session?.practice_level} />
      )}

      {/* Speech Metrics Breakdown: Only rendered when real analysis succeeds */}
      {hasAnalysisCompleted && metrics && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Speech Metrics</CardTitle>
            <CardDescription>Automated speech parameters recorded for this session.</CardDescription>
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

      {/* Audio Playback Component: Always available for saved audio */}
      <AudioPlayer 
        sessionId={sessionId!} 
        initialDuration={session?.duration} 
        onDurationLoaded={handleAudioDurationLoaded} 
        onError={(err) => setAudioError(err)}
      />

      {/* AI Clinical Observation: Only rendered when real analysis succeeds */}
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

      {/* Failed Analysis Retry Section */}
      {isAnalysisFailed && (
        <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">
                    Practice level unavailable
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

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
        <Link 
          to="/practice"
          className="inline-flex h-10 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full items-center justify-center gap-2 text-sm font-medium transition-colors"
        >
          Practice Again
        </Link>
        <Link 
          to="/sessions"
          className="inline-flex h-10 px-6 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-full items-center justify-center gap-2 text-sm font-medium transition-colors"
        >
          View All Sessions
        </Link>
      </div>
    </div>
  );
}
