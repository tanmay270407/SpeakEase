import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Users, FileText, Activity, Clock, ChevronRight, Search, UserPlus, Inbox, Sparkles, ArrowRight } from "lucide-react";
import { formatDuration } from "../../lib/utils";
import { getExerciseDetailsById } from "../../data/exerciseDetailsData";
import { Avatar } from "../../components/Avatar";
import { CardSkeleton } from "../../components/ui/Skeleton";

export function SLPDashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  
  const [slpId, setSlpId] = useState<string | null>(null);
  const [patientCount, setPatientCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [totalPracticeSeconds, setTotalPracticeSeconds] = useState(0);
  const [needsReviewSessions, setNeedsReviewSessions] = useState<any[]>([]);
  const [inactivePatients, setInactivePatients] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [speechMetrics, setSpeechMetrics] = useState<any[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        if (!profile?.id) return;

        // 1. Get SLP ID
        const { data: slpData } = await (supabase.from('slps') as any)
          .select('id')
          .eq('user_id', profile.id)
          .single();

        if (!slpData) return;
        setSlpId(slpData.id);

        // 2. Fetch Active Assigned Patients from Supabase
        const { data: assignments } = await (supabase.from('patient_assignments') as any)
          .select('patient_id, profiles!patient_assignments_patient_id_fkey(full_name, avatar_url)')
          .eq('slp_id', slpData.id)
          .eq('status', 'ACTIVE');
        
        const patientIds = Array.from(new Set((assignments || []).map((a: any) => a.patient_id)));
        setPatientCount(patientIds.length);

        // 3. Check pending received requests
        const { count: reqCount } = await (supabase.from('connection_requests') as any)
          .select('id', { count: 'exact' })
          .eq('receiver_id', profile.id)
          .eq('status', 'pending');
        setPendingRequestsCount(reqCount || 0);

        // 4. Fetch Patient Practice Sessions
        if (patientIds.length > 0) {
          const { data: allPatientSessions } = await (supabase.from('sessions') as any)
            .select(`
              id,
              created_at,
              duration,
              review_status,
              user_id,
              exercise_id,
              exercises ( name ),
              profiles!sessions_user_id_fkey ( full_name, avatar_url )
            `)
            .in('user_id', patientIds)
            .order('created_at', { ascending: false });
          
          const validSessions = allPatientSessions || [];
          setSessionCount(validSessions.length);
          const totalSec = validSessions.reduce((acc: number, s: any) => acc + (Number(s.duration) || 0), 0);
          setTotalPracticeSeconds(totalSec);

          // Sessions needing review (any non-reviewed session)
          const reviewSessions = validSessions.filter((s: any) => s.review_status !== 'REVIEWED');
          setNeedsReviewSessions(reviewSessions);
          setRecentSessions(validSessions);

          // Calculate inactive patients (> 7 days without practice)
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const inactive = (assignments || []).filter((a: any) => {
            const pSessions = validSessions.filter((s: any) => s.user_id === a.patient_id);
            if (pSessions.length === 0) return true;
            return new Date(pSessions[0].created_at) < sevenDaysAgo;
          });
          setInactivePatients(inactive);

          // 5. Fetch speech metrics for recent sessions
          const sessionIds = validSessions.slice(0, 10).map((s: any) => s.id);
          const { data: metrics } = await (supabase.from('speech_metrics') as any)
            .select('id, session_id, repetitions, pauses, prolongations, speech_rate, created_at')
            .in('session_id', sessionIds)
            .order('created_at', { ascending: false });

          const formattedMetrics = (metrics || []).map((m: any) => {
            const wpm = Number(m.speech_rate) || 0;
            const fluency = Math.min(10, Math.max(1, 10 - ((m.repetitions || 0) * 1.5 + (m.pauses || 0) * 0.8)));
            const pacing = wpm >= 100 && wpm <= 160 ? 9.5 : wpm > 0 ? 7.5 : 5.0;
            return {
              id: m.id,
              session_id: m.session_id,
              fluency_score: fluency,
              articulation_score: pacing,
              speech_rate: wpm
            };
          });
          setSpeechMetrics(formattedMetrics);
        } else {
          setSessionCount(0);
          setTotalPracticeSeconds(0);
          setNeedsReviewSessions([]);
          setRecentSessions([]);
          setInactivePatients([]);
          setSpeechMetrics([]);
        }

      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();

    // Setup realtime subscription for live synchronization
    const channel = supabase
      .channel('slp_dashboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        loadDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_assignments' }, () => {
        loadDashboard();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  if (loading) {
    return (
      <div className="space-y-8 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">SLP Dashboard</h1>
          <p className="text-slate-500 text-sm">Overview of your assigned patients and practice sessions.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">SLP Dashboard</h1>
          <p className="text-slate-500 text-sm">Overview of your assigned patients and sessions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link 
            to="/slp/find-patients" 
            className="flex items-center gap-1.5 text-xs px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-medium shadow-sm transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Find Patients
          </Link>
          <Link 
            to="/slp/requests" 
            className="relative flex items-center gap-1.5 text-xs px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-md font-medium shadow-sm transition-colors"
          >
            <Inbox className="w-3.5 h-3.5 text-teal-600" />
            Requests
            {pendingRequestsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                {pendingRequestsCount}
              </span>
            )}
          </Link>
          <Link 
            to="/slp/assistant" 
            className="flex items-center gap-1.5 text-xs px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium shadow-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
            Clinical Assistant
          </Link>
        </div>
      </div>

      {/* Google Gemini Clinical Intelligence Briefing */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-teal-50/50 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                Google Gemini Clinical Intelligence
              </span>
              <span className="text-xs text-slate-400">• Active</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              {needsReviewSessions.length > 0
                ? `${needsReviewSessions.length} session${needsReviewSessions.length > 1 ? 's' : ''} awaiting your clinical observation`
                : 'All patient practice sessions are clinically up to date'}
            </h3>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              {needsReviewSessions.length > 0 ? (
                <>
                  Gemini acoustic models have completed preliminary transcription and metric extraction for{' '}
                  <span className="font-semibold text-slate-800">
                    {needsReviewSessions[0]?.profiles?.full_name || 'your assigned patient'}
                  </span>
                  . Observations for repetitions, pauses, and speech rate are prepared for your clinical review.
                </>
              ) : (
                'Assigned patients are maintaining steady speech practice adherence. Gemini acoustic pipelines are monitoring speech rate, sound repetitions, and breath pacing in real time.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {needsReviewSessions.length > 0 && (
              <Link
                to={`/slp/sessions?sessionId=${needsReviewSessions[0]?.id}`}
                className="flex items-center gap-1.5 text-xs px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-xs transition-colors"
              >
                Review Session
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            <Link
              to="/slp/assistant"
              className="flex items-center gap-1.5 text-xs px-3.5 py-2 border border-indigo-200 bg-white hover:bg-indigo-50/50 text-indigo-700 rounded-lg font-medium transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Ask Gemini Assistant
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-teal-50 text-teal-600 rounded-lg">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Patients</p>
                <p className="text-2xl font-bold text-slate-900">{patientCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Total Sessions</p>
                <p className="text-2xl font-bold text-slate-900">{sessionCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Practice Time</p>
                <p className="text-2xl font-bold text-slate-900">{formatDuration(totalPracticeSeconds)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">To Review</p>
                <p className="text-2xl font-bold text-slate-900">{needsReviewSessions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Needs Review</CardTitle>
            <CardDescription>Sessions awaiting your clinical observation.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {needsReviewSessions.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 italic">
                All caught up! No sessions pending review.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {needsReviewSessions.map((session) => {
                  const exerciseTitle = session.exercises?.name || (session.exercise_id ? getExerciseDetailsById(session.exercise_id)?.title || 'Exercise Routine' : 'Practice Session');
                  return (
                  <Link 
                    key={session.id}
                    to={`/slp/sessions?sessionId=${session.id}`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar 
                        name={session.profiles?.full_name || 'Patient'} 
                        src={session.profiles?.avatar_url}
                        className="w-10 h-10 text-xs shrink-0"
                      />
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900 text-sm">
                          {session.profiles?.full_name || 'Patient'}
                        </div>
                        <div className="text-xs font-medium text-indigo-700">
                          {exerciseTitle}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{new Date(session.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(session.duration)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal text-xs">Needs Review</Badge>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Sessions</CardTitle>
            <CardDescription>Latest patient activity.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {recentSessions.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 italic">
                No recent sessions found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentSessions.slice(0, 5).map((session) => {
                  const exerciseTitle = session.exercises?.name || (session.exercise_id ? getExerciseDetailsById(session.exercise_id)?.title || 'Exercise Routine' : 'Practice Session');
                  return (
                  <Link 
                    key={session.id}
                    to={`/slp/sessions?sessionId=${session.id}`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar 
                        name={session.profiles?.full_name || 'Patient'} 
                        src={session.profiles?.avatar_url}
                        className="w-10 h-10 text-xs shrink-0"
                      />
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900 text-sm">
                          {session.profiles?.full_name || 'Patient'}
                        </div>
                        <div className="text-xs font-medium text-slate-600">
                          {exerciseTitle}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{new Date(session.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {formatDuration(session.duration)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inactive Patients</CardTitle>
            <CardDescription>Patients with no sessions in 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {inactivePatients.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 italic">
                All patients are active.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {inactivePatients.map((patient) => (
                  <Link 
                    key={patient.patient_id}
                    to={`/slp/patients/${patient.patient_id}`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="font-medium text-slate-900">
                      {patient.profiles?.full_name || 'Patient'}
                    </div>
                    <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-200 font-normal">Inactive</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Speech Metrics</CardTitle>
            <CardDescription>Metrics from latest sessions.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {speechMetrics.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 italic">
                No metrics found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {speechMetrics.slice(0, 5).map((metric) => (
                  <div key={metric.id} className="p-4 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Fluency</span>
                      <span className="font-medium">{metric.fluency_score.toFixed(1)}/10</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${(metric.fluency_score / 10) * 100}%` }} />
                    </div>
                    <div className="flex justify-between items-center text-sm pt-2">
                      <span className="text-slate-500">Articulation</span>
                      <span className="font-medium">{metric.articulation_score.toFixed(1)}/10</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-teal-600 h-1.5 rounded-full" style={{ width: `${(metric.articulation_score / 10) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
