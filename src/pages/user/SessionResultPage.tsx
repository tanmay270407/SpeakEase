import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle, ArrowRight, Clock, Activity, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { AudioPlayer } from "../../components/AudioPlayer";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";

export function SessionResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [session, setSession] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [observation, setObservation] = useState<any>(null);

  useEffect(() => {
    async function loadResults() {
      try {
        setLoading(true);
        if (!sessionId) throw new Error("No session ID provided.");

        const [sessionRes, metricsRes, obsRes] = await Promise.all([
          (supabase.from("sessions") as any).select("*").eq("id", sessionId).single(),
          (supabase.from("speech_metrics") as any).select("*").eq("session_id", sessionId).single(),
          (supabase.from("ai_observations") as any).select("*").eq("session_id", sessionId).single()
        ]);

        if (sessionRes.error) throw sessionRes.error;
        
        setSession(sessionRes.data);
        
        // Metrics and observation might not exist if skipped/failed, don't throw hard errors for them
        if (metricsRes.data) setMetrics(metricsRes.data.metrics);
        if (obsRes.data) setObservation(obsRes.data.observation_text);

      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load session results.");
      } finally {
        setLoading(false);
      }
    }

    loadResults();
  }, [sessionId]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
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

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-8">
      <div className="flex flex-col items-center text-center space-y-4 pb-4">
        <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Session Complete</h1>
        <p className="text-slate-500">Your practice session has been saved and analyzed.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-slate-50 text-slate-600 rounded-md border border-slate-200">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Duration</p>
              <p className="text-2xl font-semibold text-slate-900">{session ? formatTime(session.duration) : "00:00"}</p>
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
              <p className="text-2xl font-semibold text-slate-900">{metrics?.speech_rate ?? "--"} <span className="text-sm font-normal text-slate-500">wpm</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Speech Metrics</CardTitle>
            <CardDescription>Automated observations from your session.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              <div className="flex items-center justify-between py-3">
                <span className="text-slate-600">Possible repetitions</span>
                <span className="font-semibold text-slate-900">{metrics.repetitions ?? 0}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-slate-600">Pauses</span>
                <span className="font-semibold text-slate-900">{metrics.pauses ?? 0}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-slate-600">Possible prolongations</span>
                <span className="font-semibold text-slate-900">{metrics.prolongations ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <AudioPlayer sessionId={sessionId!} />

      {observation && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">AI Observation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700 leading-relaxed">
              "{observation}"
            </p>
          </CardContent>
        </Card>
      )}

      {!metrics && !observation && (
        <div className="rounded-md bg-amber-50 p-4 border border-amber-200">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-800">Analysis Skipped</h3>
              <div className="mt-2 text-sm text-amber-700">
                <p>The automated speech analysis was skipped or failed. Your session duration has been recorded.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-center pt-6">
        <Link 
          to="/dashboard"
          className="inline-flex h-10 px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full items-center justify-center gap-2 text-sm font-medium transition-colors"
        >
          Return to Dashboard
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
