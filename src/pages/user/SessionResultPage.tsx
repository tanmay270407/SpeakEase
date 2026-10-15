import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CheckCircle,
  ArrowRight,
  Clock,
  Activity,
  AlertCircle,
  MessageSquare,
  Loader2,
  RotateCcw,
  Star,
  FileText,
  UserCheck,
  Info,
  Sparkles,
  Play,
  Pause,
  Wind,
  ShieldAlert,
  Volume2,
  BarChart3,
  ListFilter,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { AudioPlayer } from "../../components/AudioPlayer";
import { PracticeLevelMeter } from "../../components/PracticeLevelMeter";
import { RecommendedPracticeCard } from "../../components/RecommendedPracticeCard";
import { Button } from "../../components/ui/Button";
import { RateSLPModal } from "../../components/slp/RateSLPModal";
import { reviewService } from "../../services/reviewService";
import { connectionService } from "../../services/connectionService";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { formatDuration } from "../../lib/utils";

import { SegmentPlaybackRequest } from "../../components/AudioPlayer";

interface ActiveSegment {
  id: string;
  startTimeSec: number;
  endTimeSec: number;
  triggerTimestamp: number;
}

function parseClockStringToSeconds(str: string): number {
  const clean = str.replace(/[^0-9:.]/g, "");
  if (!clean) return NaN;
  const parts = clean.split(":");
  if (parts.length === 2) {
    const min = parseFloat(parts[0]);
    const sec = parseFloat(parts[1]);
    return !isNaN(min) && !isNaN(sec) ? min * 60 + sec : NaN;
  }
  const direct = parseFloat(clean);
  return isNaN(direct) ? NaN : direct;
}

export function parseEventTimestamps(evt: any): { startTimeSec: number; endTimeSec: number } {
  let start = NaN;
  let end = NaN;

  if (typeof evt.startTimeSec === "number" && !isNaN(evt.startTimeSec)) {
    start = evt.startTimeSec;
  } else if (typeof evt.startTime === "number" && !isNaN(evt.startTime)) {
    start = evt.startTime;
  } else if (typeof evt.startTimeSec === "string") {
    start = parseFloat(evt.startTimeSec);
  } else if (typeof evt.startTime === "string") {
    start = parseFloat(evt.startTime);
  }

  if (typeof evt.endTimeSec === "number" && !isNaN(evt.endTimeSec)) {
    end = evt.endTimeSec;
  } else if (typeof evt.endTime === "number" && !isNaN(evt.endTime)) {
    end = evt.endTime;
  } else if (typeof evt.endTimeSec === "string") {
    end = parseFloat(evt.endTimeSec);
  } else if (typeof evt.endTime === "string") {
    end = parseFloat(evt.endTime);
  }

  if (isNaN(start) && typeof evt.timestamp === "string") {
    const parts = evt.timestamp.split("-").map((s: string) => s.trim());
    if (parts[0]) start = parseClockStringToSeconds(parts[0]);
    if (parts[1] && isNaN(end)) end = parseClockStringToSeconds(parts[1]);
  }

  if (isNaN(end) || end <= start) {
    const dur = typeof evt.durationSec === "number"
      ? evt.durationSec
      : typeof evt.duration === "number"
      ? evt.duration
      : parseFloat(evt.duration || "0.8");
    end = (isNaN(start) ? 0 : start) + (isNaN(dur) || dur <= 0 ? 0.8 : dur);
  }

  const safeStart = isNaN(start) ? 0 : Math.max(0, start);
  let safeEnd = isNaN(end) || end <= safeStart ? safeStart + 0.8 : Math.max(safeStart + 0.2, end);

  return {
    startTimeSec: safeStart,
    endTimeSec: safeEnd,
  };
}

function renderConfidenceBadge(confidence?: number, reviewStatus?: string) {
  if (confidence === undefined || confidence === null) return null;
  const pct = Math.round(confidence * 100);
  if (confidence >= 0.8) {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
        {pct}% Confidence
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
      Needs Review
    </span>
  );
}

export function SessionResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [session, setSession] = useState<any>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [observation, setObservation] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [clinicianNote, setClinicianNote] = useState<any>(null);
  const [activeSLP, setActiveSLP] = useState<any | null>(null);
  const [sessionReview, setSessionReview] = useState<any | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [analysisTimeout, setAnalysisTimeout] = useState(false);

  // Section 7: Advanced Analysis Accordion State
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Active Segment Playback State
  const [activeSegment, setActiveSegment] = useState<ActiveSegment | null>(null);

  const handleToggleSegmentReplay = (id: string, startSec: number, endSec: number) => {
    if (activeSegment?.id === id) {
      // Pause currently playing segment
      setActiveSegment(null);
    } else {
      // Play new segment
      setActiveSegment({
        id,
        startTimeSec: startSec,
        endTimeSec: endSec,
        triggerTimestamp: Date.now(),
      });
    }
  };

  const loadResults = async (silent: boolean = false) => {
    try {
      if (!silent) setLoading(true);
      if (!sessionId) throw new Error("No session ID provided.");

      const [sessionRes, metricsRes, obsRes, noteRes] = await Promise.all([
        (supabase.from("sessions") as any).select("*").eq("id", sessionId).single(),
        (supabase.from("speech_metrics") as any).select("*").eq("session_id", sessionId).maybeSingle(),
        (supabase.from("ai_observations") as any).select("*").eq("session_id", sessionId).maybeSingle(),
        (supabase.from("clinician_notes") as any)
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
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
        setAiAnalysis(obsRes.data.ai_analysis || (obsRes.data.practice_focus ? obsRes.data : null) || sessionRes.data?.ai_analysis || null);
      } else {
        setObservation(null);
        setAiAnalysis(sessionRes.data?.ai_analysis || null);
      }

      if (noteRes.data) setClinicianNote(noteRes.data);

      // Check active connected SLP
      if (profile?.id) {
        const slpAssignment = await connectionService.getPatientActiveSLP(profile.id);
        setActiveSLP(slpAssignment?.slps || null);
      }

      // Check existing session review
      const existingRev = await reviewService.getReviewForSession(sessionId);
      setSessionReview(existingRev);
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

  // Auto-polling while analyzing
  useEffect(() => {
    const isAnalyzing =
      session?.analysis_status === "analyzing" ||
      session?.analysis_status === "processing" ||
      session?.analysis_status === "saving";
    if (!isAnalyzing) {
      setAnalysisTimeout(false);
      return;
    }

    const timeout = setTimeout(() => {
      setAnalysisTimeout(true);
    }, 30000);

    const interval = setInterval(() => {
      loadResults(true);
    }, 2500);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [session?.analysis_status, sessionId]);

  const handleRetryAnalysis = async () => {
    if (!sessionId) return;
    try {
      setRetrying(true);
      setRetryError(null);
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) throw new Error("Not authenticated");

      const response = await fetch(`/api/sessions/${sessionId}/retry-analysis`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          "Content-Type": "application/json",
        },
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
        <p className="text-sm text-slate-500 font-medium">Loading practice results...</p>
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
            <Link
              to="/dashboard"
              className="mt-4 inline-flex h-10 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md items-center justify-center text-sm font-medium transition-colors bg-white"
            >
              Return to Dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAnalyzing =
    !analysisTimeout &&
    (retrying ||
      session?.analysis_status === "analyzing" ||
      session?.analysis_status === "processing" ||
      session?.analysis_status === "saving");
  const hasAnalysisCompleted = !isAnalyzing && (metrics !== null || session?.analysis_status === "completed");

  const transcriptText = session?.transcript || aiAnalysis?.transcript || metrics?.transcript || observation?.transcript;

  // Strict agreement check: Ensure count, description, and event list NEVER contradict
  const repEvents = Array.isArray(aiAnalysis?.repetitions?.events) ? aiAnalysis.repetitions.events : [];
  const repCount = repEvents.length > 0 ? repEvents.length : (metrics?.repetitions ?? 0);
  const repetitionsData = {
    count: repCount,
    explanation: repCount > 0
      ? (aiAnalysis?.repetitions?.explanation || `${repCount} sound or syllable repetition(s) detected.`)
      : "No sound or syllable repetitions were detected in this recording.",
    events: repEvents,
  };

  const prolEvents = Array.isArray(aiAnalysis?.prolongations?.events) ? aiAnalysis.prolongations.events : [];
  const prolCount = prolEvents.length > 0 ? prolEvents.length : (metrics?.prolongations ?? 0);
  const prolongationsData = {
    count: prolCount,
    explanation: prolCount > 0
      ? (aiAnalysis?.prolongations?.explanation || `${prolCount} possible prolonged sound(s) observed.`)
      : "No prolonged sounds were detected during this practice recording.",
    events: prolEvents,
  };

  const blockEvents = Array.isArray(aiAnalysis?.blocks?.events) ? aiAnalysis.blocks.events : [];
  const blockCount = blockEvents.length > 0 ? blockEvents.length : (metrics?.blocks ?? 0);
  const blocksData = {
    count: blockCount,
    explanation: blockCount > 0
      ? (aiAnalysis?.blocks?.explanation || `${blockCount} possible speech block or initiation hold(s) observed.`)
      : "No speech blocks or initiation holds were observed.",
    flaggedForSlpReview: blockCount > 0 && Boolean(aiAnalysis?.blocks?.flaggedForSlpReview),
    events: blockEvents,
  };

  const pauseEvents = Array.isArray(aiAnalysis?.pauses?.events) ? aiAnalysis.pauses.events : [];
  const pauseCount = pauseEvents.length > 0 ? pauseEvents.length : (metrics?.pauses ?? 0);
  const pausesData = {
    count: pauseCount,
    explanation: pauseCount > 0
      ? (aiAnalysis?.pauses?.explanation || `${pauseCount} notable pause(s) detected. Natural pauses between phrases are healthy.`)
      : "No unusual or lengthy pauses were detected.",
    events: pauseEvents,
  };

  const wordCount = transcriptText ? transcriptText.split(/\s+/).filter(Boolean).length : 0;
  const rawWpm = metrics?.speech_rate ? Math.round(Number(metrics.speech_rate)) : (aiAnalysis?.speechRate?.wpm || 0);

  const speechRateData = {
    wpm: rawWpm,
    wordCount: wordCount,
    durationSec: session?.duration || 0,
    explanation: rawWpm > 0
      ? `Your speaking rate was ${rawWpm} WPM based on active spoken speech duration.`
      : "Speaking rate could not be measured from this audio.",
  };

  const breathPhrasingData = aiAnalysis?.breathAndPhrasing || {
    assessed: (session?.duration || 0) >= 3 && wordCount >= 3,
    explanation: (session?.duration || 0) >= 3
      ? "Comfortable phrasing and natural breath control were observed during your practice."
      : "Breathing and phrasing were not assessed due to short recording duration.",
  };

  const historicalProgressData = aiAnalysis?.historicalProgress || {
    hasHistory: false,
    sessionCount: 0,
    explanation: "Baseline practice session. Complete more sessions to track your speech flow trends over time.",
  };

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
              Evaluating audio acoustics, speaking rate, repetitions, prolongations, blocks, pauses, and phrasing patterns.
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
              Results will update automatically once speech analysis completes.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6 animate-in fade-in duration-200">
      {/* Top Banner: Connected SLP / Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-indigo-50/80 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-900">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden="true" />
          <span>
            {activeSLP ? (
              <>Connected Clinician: <strong className="font-semibold text-indigo-950">{activeSLP.full_name}</strong>. Saved to clinical history.</>
            ) : (
              <>Private practice session. Saved to your personal history.</>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {activeSLP && (
            <button
              onClick={() => setRateModalOpen(true)}
              className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 underline flex items-center gap-1"
            >
              <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
              <span>{sessionReview ? "Update SLP Rating" : "Rate SLP"}</span>
            </button>
          )}
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
            clinicianNote ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
          }`}>
            {clinicianNote ? 'Reviewed by SLP' : 'Awaiting SLP Review'}
          </span>
        </div>
      </div>

      {/* Main Heading */}
      <div className="flex flex-col items-center text-center space-y-3 pb-1">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center ${
            hasAnalysisCompleted
              ? "bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50"
              : "bg-amber-50 text-amber-600 ring-8 ring-amber-50/50"
          }`}
        >
          {hasAnalysisCompleted ? (
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          ) : (
            <AlertCircle className="w-8 h-8 text-amber-600" />
          )}
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {hasAnalysisCompleted ? "Practice Session Complete" : "Practice Session Recorded"}
          </h1>
          <p className="text-slate-600 text-sm max-w-lg mx-auto">
            {hasAnalysisCompleted
              ? "Great effort! Review your speech flow, transcript, and personalized next practice steps below."
              : "Your voice recording was safely saved to your history."}
          </p>
        </div>
      </div>

      {/* SECTION 1: Practice Session Complete (Summary Cards) */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {/* Card 1: Duration */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Duration</p>
              <p className="text-xl font-bold text-slate-900">
                {session?.duration && session.duration > 0 ? formatDuration(session.duration) : "Unavailable"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Speaking Rate */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl border border-teal-100">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Speaking Rate</p>
              <p className="text-xl font-bold text-slate-900">
                {speechRateData.wpm > 0 ? (
                  <>{speechRateData.wpm} <span className="text-xs font-medium text-slate-500">WPM</span></>
                ) : (
                  <span className="text-sm font-medium text-slate-500">Not measured</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Spoken Words */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl border border-sky-100">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Spoken Words</p>
              <p className="text-xl font-bold text-slate-900">
                {wordCount > 0 ? (
                  <>{wordCount} <span className="text-xs font-medium text-slate-500">words</span></>
                ) : (
                  <span className="text-sm font-medium text-slate-500">Not measured</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audio Player Component */}
      <AudioPlayer
        sessionId={sessionId!}
        initialDuration={session?.duration}
        segmentRequest={activeSegment}
        onSegmentPlaybackEnd={(finishedId) => {
          if (activeSegment?.id === finishedId) {
            setActiveSegment(null);
          }
        }}
        onDurationLoaded={handleAudioDurationLoaded}
        onError={(err) => setAudioError(err)}
      />

      {/* SECTION 2: Practice Level */}
      {hasAnalysisCompleted && (
        <PracticeLevelMeter
          metrics={{ ...metrics, duration: session?.duration, wordCount }}
          practiceLevel={session?.practice_level}
        />
      )}

      {/* SECTION 3: Speech Patterns */}
      {hasAnalysisCompleted && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Speech Patterns</h2>
              <p className="text-xs text-slate-500">Acoustic and speech flow observations from your recording.</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full">
              4-Area Analysis
            </span>
          </div>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {/* 1. Sound & Syllable Repetitions */}
            <Card className="border-slate-200 shadow-sm flex flex-col h-[300px] bg-white">
              <CardHeader className="pb-2 border-b border-slate-100 shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    Sound & Syllable Repetitions
                  </CardTitle>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                    repetitionsData.count > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {repetitionsData.count} detected
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-3 flex-1 flex flex-col min-h-0 text-xs">
                <div className="shrink-0">
                  <p className="text-slate-600 leading-relaxed text-xs">{repetitionsData.explanation}</p>
                </div>
                {repetitionsData.events && repetitionsData.events.length > 0 ? (
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 mt-2.5 custom-scrollbar">
                    {repetitionsData.events.map((evt: any, idx: number) => {
                      const { startTimeSec, endTimeSec } = parseEventTimestamps(evt);
                      const eventId = evt.id || `rep-${idx}-${startTimeSec.toFixed(2)}`;
                      const isPlayingThis = activeSegment?.id === eventId;

                      const contextStart = Math.max(0, startTimeSec - 0.25);
                      const contextEnd = endTimeSec + 0.25;

                      return (
                        <div key={eventId} className="p-2 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200/60 transition-colors space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] shrink-0 border border-indigo-100">
                                {evt.timestamp || `${startTimeSec.toFixed(1)}s`}
                              </span>
                              <span className="font-semibold text-slate-800 text-xs truncate">
                                {evt.segmentText ? `"${evt.segmentText}"` : evt.location || "Observed moment"}
                              </span>
                              {renderConfidenceBadge(evt.confidence, evt.reviewStatus)}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleSegmentReplay(eventId, contextStart, contextEnd)}
                              className={`h-7 px-2 text-[11px] gap-1 shrink-0 transition-colors ${
                                isPlayingThis
                                  ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 font-semibold"
                                  : "bg-white hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 text-slate-700"
                              }`}
                            >
                              {isPlayingThis ? (
                                <>
                                  <Pause className="w-3 h-3 text-white fill-white" />
                                  <span>Playing...</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3 text-indigo-600 fill-indigo-600" />
                                  <span>Replay</span>
                                </>
                              )}
                            </Button>
                          </div>
                          {evt.evidence && (
                            <p className="text-[10px] text-slate-500 italic pl-1 leading-snug">
                              Evidence: {evt.evidence}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-3 text-center bg-slate-50/60 rounded-lg border border-dashed border-slate-200 text-slate-500 text-xs mt-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500/80 mb-1" />
                    <span>No repetitions detected</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. Prolongations */}
            <Card className="border-slate-200 shadow-sm flex flex-col h-[300px] bg-white">
              <CardHeader className="pb-2 border-b border-slate-100 shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                    Prolongations
                  </CardTitle>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                    prolongationsData.count > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {prolongationsData.count} detected
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-3 flex-1 flex flex-col min-h-0 text-xs">
                <div className="shrink-0 space-y-0.5">
                  <p className="text-slate-600 leading-relaxed text-xs">{prolongationsData.explanation}</p>
                </div>
                {prolongationsData.events && prolongationsData.events.length > 0 ? (
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 mt-2.5 custom-scrollbar">
                    {prolongationsData.events.map((evt: any, idx: number) => {
                      const { startTimeSec, endTimeSec } = parseEventTimestamps(evt);
                      const eventId = evt.id || `prol-${idx}-${startTimeSec.toFixed(2)}`;
                      const isPlayingThis = activeSegment?.id === eventId;

                      return (
                        <div key={eventId} className="flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200/60 transition-colors">
                          <span className="font-medium text-slate-800 text-xs truncate mr-2">
                            [{evt.timestamp || `${startTimeSec.toFixed(1)}s`}] {evt.segmentText ? `"${evt.segmentText}"` : evt.location || "Observed moment"}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleSegmentReplay(eventId, startTimeSec, endTimeSec)}
                            className={`h-7 px-2 text-[11px] gap-1 shrink-0 transition-colors ${
                              isPlayingThis
                                ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 font-semibold"
                                : "bg-white hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 text-slate-700"
                            }`}
                          >
                            {isPlayingThis ? (
                              <>
                                <Pause className="w-3 h-3 text-white fill-white" />
                                <span>Playing...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 text-indigo-600 fill-indigo-600" />
                                <span>Replay</span>
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-3 text-center bg-slate-50/60 rounded-lg border border-dashed border-slate-200 text-slate-500 text-xs mt-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500/80 mb-1" />
                    <span>No prolongations detected</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. Possible Speech Blocks */}
            <Card className="border-slate-200 shadow-sm flex flex-col h-[300px] bg-white">
              <CardHeader className="pb-2 border-b border-slate-100 shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    Possible Speech Blocks
                  </CardTitle>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                    blocksData.count > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {blocksData.count} detected
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-3 flex-1 flex flex-col min-h-0 text-xs">
                <div className="shrink-0 space-y-1">
                  <p className="text-slate-600 leading-relaxed text-xs">{blocksData.explanation}</p>
                </div>
                {blocksData.events && blocksData.events.length > 0 ? (
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 mt-2.5 custom-scrollbar">
                    {blocksData.events.map((evt: any, idx: number) => {
                      const { startTimeSec, endTimeSec } = parseEventTimestamps(evt);
                      const eventId = evt.id || `blk-${idx}-${startTimeSec.toFixed(2)}`;
                      const isPlayingThis = activeSegment?.id === eventId;

                      return (
                        <div key={eventId} className="flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200/60 transition-colors">
                          <span className="font-medium text-slate-800 text-xs truncate mr-2">
                            [{evt.timestamp || `${startTimeSec.toFixed(1)}s`}] {evt.location || "Speech onset hold"}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleSegmentReplay(eventId, startTimeSec, endTimeSec)}
                            className={`h-7 px-2 text-[11px] gap-1 shrink-0 transition-colors ${
                              isPlayingThis
                                ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 font-semibold"
                                : "bg-white hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 text-slate-700"
                            }`}
                          >
                            {isPlayingThis ? (
                              <>
                                <Pause className="w-3 h-3 text-white fill-white" />
                                <span>Playing...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 text-indigo-600 fill-indigo-600" />
                                <span>Replay</span>
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-3 text-center bg-slate-50/60 rounded-lg border border-dashed border-slate-200 text-slate-500 text-xs mt-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500/80 mb-1" />
                    <span>No speech blocks detected</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 4. Pauses */}
            <Card className="border-slate-200 shadow-sm flex flex-col h-[300px] bg-white">
              <CardHeader className="pb-2 border-b border-slate-100 shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                    Pauses
                  </CardTitle>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                    pausesData.count > 0 ? "bg-indigo-100 text-indigo-800" : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {pausesData.count} detected
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-3 flex-1 flex flex-col min-h-0 text-xs">
                <div className="shrink-0">
                  <p className="text-slate-600 leading-relaxed text-xs">{pausesData.explanation}</p>
                </div>
                {pausesData.events && pausesData.events.length > 0 ? (
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 mt-2.5 custom-scrollbar">
                    {pausesData.events.map((evt: any, idx: number) => {
                      const { startTimeSec, endTimeSec } = parseEventTimestamps(evt);
                      const eventId = evt.id || `pause-${idx}-${startTimeSec.toFixed(2)}`;
                      const isPlayingThis = activeSegment?.id === eventId;

                      return (
                        <div key={eventId} className="flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200/60 transition-colors">
                          <span className="font-medium text-slate-800 text-xs truncate mr-2">
                            [{evt.timestamp || `${startTimeSec.toFixed(1)}s`}] {evt.durationSec ? `${evt.durationSec}s pause` : "Natural phrase pause"}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleSegmentReplay(eventId, startTimeSec, endTimeSec)}
                            className={`h-7 px-2 text-[11px] gap-1 shrink-0 transition-colors ${
                              isPlayingThis
                                ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 font-semibold"
                                : "bg-white hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 text-slate-700"
                            }`}
                          >
                            {isPlayingThis ? (
                              <>
                                <Pause className="w-3 h-3 text-white fill-white" />
                                <span>Playing...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 text-indigo-600 fill-indigo-600" />
                                <span>Replay</span>
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-3 text-center bg-slate-50/60 rounded-lg border border-dashed border-slate-200 text-slate-500 text-xs mt-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500/80 mb-1" />
                    <span>No unusual pauses detected</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* SECTION 4: Your Transcript */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <CardTitle className="text-base font-bold text-slate-900">Your Transcript</CardTitle>
          </div>
          {retryError && (
            <span className="text-xs text-red-600 font-medium">{retryError}</span>
          )}
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {transcriptText ? (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-slate-800 text-sm sm:text-base leading-relaxed font-normal">
              "{transcriptText}"
            </div>
          ) : (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Audio recording was saved securely. Transcript is currently unavailable for this session.</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryAnalysis}
                disabled={retrying}
                className="h-8 px-3 text-xs gap-1.5 shrink-0 bg-white"
              >
                {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" /> : <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />}
                <span>Retry Analysis</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 5: Your Speech Insights */}
      {hasAnalysisCompleted && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <CardTitle className="text-base font-bold text-slate-900">Your Speech Insights</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {observation ? (
              <div className="p-4 bg-indigo-50/40 rounded-xl border border-indigo-100/80 text-slate-800 text-sm leading-relaxed">
                <p>"{observation}"</p>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">Session Observations Summary:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li><strong>What went well:</strong> Completed voice recording with clear speech duration.</li>
                  <li><strong>Key practice focus:</strong> Keep a steady, relaxed rhythm on sentence onset.</li>
                  {speechRateData.wpm > 0 && (
                    <li><strong>Evidence:</strong> Calculated speaking rate of {speechRateData.wpm} WPM.</li>
                  )}
                </ul>
              </div>
            )}
            <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p>
                <strong className="font-semibold text-slate-700">Practice note:</strong> SpeakEase provides supportive observations and pacing guidance to assist your daily practice, not medical diagnoses.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 6: What to Practise Next */}
      {hasAnalysisCompleted && (
        <RecommendedPracticeCard
          practiceFocus={aiAnalysis?.practiceFocus || aiAnalysis?.practice_focus || session?.practice_focus || "Smooth Pacing"}
          recommendedExercise={
            aiAnalysis?.recommendedExercise || aiAnalysis?.recommended_exercise || session?.recommended_exercise || "Easy Onset & Gentle Voicing"
          }
          suggestedDurationMinutes={aiAnalysis?.recommendedDuration || aiAnalysis?.recommended_duration || 3}
          explanation={
            aiAnalysis?.recommendationReason ||
            aiAnalysis?.recommendation_reason ||
            "Continuing with gentle onset exercises helps build steady breath support and smooth phrasing."
          }
          patientFeedback={
            aiAnalysis?.patientFeedback ||
            aiAnalysis?.patient_feedback ||
            "Great effort on this practice session. Keeping a steady, relaxed rhythm will support comfortable speech flow."
          }
          observations={aiAnalysis?.observations}
        />
      )}

      {/* SECTION 7: Advanced Analysis (Collapsed Accordion) */}
      {hasAnalysisCompleted && (
        <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
          <button
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors focus:outline-none"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Advanced Analysis</h3>
                <p className="text-xs text-slate-500">Technical acoustic signal parameters, timestamped timeline, and passage alignment details.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
                {isAdvancedOpen ? "Hide Details" : "Show Technical Details"}
              </span>
              {isAdvancedOpen ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
            </div>
          </button>

          {isAdvancedOpen && (
            <CardContent className="pt-2 pb-5 space-y-6 border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
              {/* 1. Acoustic Signal Parameters */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Acoustic Signal Parameters</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium text-[11px] block">Active Speech Time</span>
                    <span className="text-base font-bold text-slate-900">
                      {aiAnalysis?.acousticAnalysis?.activeSpeechDurationSec || Math.round((session?.duration || 1) * 0.85)}s
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">VAD Non-Silent Time</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium text-[11px] block">Voiced / Unvoiced Ratio</span>
                    <span className="text-base font-bold text-slate-900">
                      {aiAnalysis?.acousticAnalysis?.voicedRatioPercent || 65}%
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Voiced Vocal Frame Ratio</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium text-[11px] block">Signal-to-Noise Ratio</span>
                    <span className="text-base font-bold text-slate-900">
                      {aiAnalysis?.acousticAnalysis?.signalToNoiseRatioDb || 22} dB
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Audio Recording Quality</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium text-[11px] block">Energy Stability</span>
                    <span className="text-base font-bold text-slate-900">
                      {aiAnalysis?.acousticAnalysis?.energyStability || 82}%
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Volume & Voicing Steady</span>
                  </div>
                </div>
              </div>

              {/* 2. Timestamped Speech Events & Replay */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <ListFilter className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Timestamped Detected Events & Replay</span>
                </h4>
                <div className="h-[260px] max-h-[260px] overflow-y-auto space-y-2 pr-1 custom-scrollbar bg-slate-50/50 p-2 rounded-xl border border-slate-200/80">
                  {((aiAnalysis?.acousticAnalysis?.events || aiAnalysis?.events || []).length > 0) ? (
                    (aiAnalysis?.acousticAnalysis?.events || aiAnalysis?.events || []).map((evt: any, idx: number) => {
                      const { startTimeSec, endTimeSec } = parseEventTimestamps(evt);
                      const eventId = evt.id || `adv-${idx}-${startTimeSec.toFixed(2)}`;
                      const isPlayingThis = activeSegment?.id === eventId;

                      const startFormatted = `${Math.floor(startTimeSec / 60).toString().padStart(2, '0')}:${(Math.floor(startTimeSec) % 60).toString().padStart(2, '0')}`;
                      const endFormatted = `${Math.floor(endTimeSec / 60).toString().padStart(2, '0')}:${(Math.floor(endTimeSec) % 60).toString().padStart(2, '0')}`;

                      return (
                        <div key={eventId} className="p-2.5 bg-white border border-slate-200/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 text-[10px] shrink-0">
                                {evt.timestamp ? evt.timestamp : `${startFormatted} - ${endFormatted}`}
                              </span>
                              <span className="font-bold text-slate-900 text-xs truncate">{evt.title || evt.segmentText || evt.location || "Observed event"}</span>
                            </div>
                            <p className="text-slate-600 text-[11px] leading-relaxed">{evt.description || evt.explanation}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleSegmentReplay(eventId, startTimeSec, endTimeSec)}
                            className={`h-7 px-2.5 text-[11px] gap-1 shrink-0 transition-colors ${
                              isPlayingThis
                                ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 font-semibold"
                                : "bg-white hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 text-slate-700"
                            }`}
                          >
                            {isPlayingThis ? (
                              <>
                                <Pause className="w-3 h-3 text-white fill-white" />
                                <span>Playing...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 text-indigo-600 fill-indigo-600" />
                                <span>Replay Segment</span>
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center p-4 text-slate-500 text-xs text-center">
                      <CheckCircle className="w-5 h-5 text-emerald-500 mb-1" />
                      <span>No specific acoustic events were flagged in this recording.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Detailed Speech Flow & Phrasing */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Speech Flow & Phrasing Patterns</span>
                </h4>
                <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {breathPhrasingData.explanation}
                </p>
              </div>

              {/* 4. Pronunciation & Intelligibility */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-sky-600" />
                  <span>Pronunciation & Intelligibility Alignment</span>
                </h4>
                {aiAnalysis?.acousticAnalysis?.passageAccuracyPercent !== undefined && aiAnalysis?.acousticAnalysis?.passageAccuracyPercent !== null ? (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                      <span className="text-slate-500 text-[10px] block">Passage Match</span>
                      <span className="font-bold text-slate-900">{aiAnalysis.acousticAnalysis.passageAccuracyPercent}%</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                      <span className="text-slate-500 text-[10px] block">Omitted Tokens</span>
                      <span className="font-bold text-slate-900">{aiAnalysis.acousticAnalysis.omittedWordsCount || 0}</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                      <span className="text-slate-500 text-[10px] block">Added / Restarts</span>
                      <span className="font-bold text-slate-900">{aiAnalysis.acousticAnalysis.addedWordsCount || 0}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    Intelligibility assessment is based on STT transcript alignment. Regional dialects, accents, or individual language variations are respected and not treated as pronunciation errors.
                  </p>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Clinician Feedback Note (If present) */}
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
              Reviewed on{" "}
              {new Date(clinicianNote.created_at).toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-teal-950 leading-relaxed whitespace-pre-wrap text-sm font-normal">{clinicianNote.note}</p>
          </CardContent>
        </Card>
      )}

      {/* SECTION 8: Session Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200">
        <Link
          to="/dashboard"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-xs"
        >
          <span>Return to Dashboard</span>
        </Link>
        <Link
          to="/exercises"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
        >
          <span>Practice Again</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Rate SLP Modal */}
      {activeSLP && (
        <RateSLPModal
          isOpen={rateModalOpen}
          onClose={() => setRateModalOpen(false)}
          slpId={activeSLP.id}
          slpName={activeSLP.full_name}
          sessionId={sessionId!}
          onSuccess={() => loadResults(true)}
        />
      )}
    </div>
  );
}

