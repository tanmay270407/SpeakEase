import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Users, FileText, Activity, Clock, ChevronRight, AlertTriangle, Search, UserPlus, Inbox } from "lucide-react";
import { formatDuration } from "../../lib/utils";

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
  const [corsairError, setCorsairError] = useState<string | null>(null);

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

        // Try to fetch from Corsair first (Mandatory Hack & Build 2026 integration)
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const corsairRes = await fetch(`/api/corsair/slp/${slpData.id}/dashboard`, {
              headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (!corsairRes.ok) {
              const errData = await corsairRes.json();
              throw new Error(errData.error || errData.details || "Corsair API unavailable");
            }
            const dashboardData = await corsairRes.json();
            setPatientCount(dashboardData.patientCount);
            setSessionCount(dashboardData.sessionCount);
            setTotalPracticeSeconds(dashboardData.totalPracticeSeconds || 0);
            setNeedsReviewSessions(dashboardData.needsReviewSessions);
            setInactivePatients(dashboardData.inactivePatients || []);
            setRecentSessions(dashboardData.recentSessions || []);
            setSpeechMetrics(dashboardData.speechMetrics || []);
            setCorsairError(null);
            setLoading(false);
            return;
          }
        } catch (cErr: any) {
          console.warn("Corsair integration error, falling back to local DB:", cErr);
          setCorsairError(cErr.message);
        }

        // Fallback: Get Active Patients Count from Supabase
        const { count: pCount } = await (supabase.from('patient_assignments') as any)
          .select('id', { count: 'exact' })
          .eq('slp_id', slpData.id)
          .eq('status', 'ACTIVE');
        
        setPatientCount(pCount || 0);

        // Check pending received requests
        const { count: reqCount } = await (supabase.from('connection_requests') as any)
          .select('id', { count: 'exact' })
          .eq('receiver_id', profile.id)
          .eq('status', 'pending');
        setPendingRequestsCount(reqCount || 0);

        // Get Active Patients IDs to fetch sessions
        const { data: assignments } = await (supabase.from('patient_assignments') as any)
          .select('patient_id')
          .eq('slp_id', slpData.id)
          .eq('status', 'ACTIVE');

        const patientIds = assignments?.map((a: any) => a.patient_id) || [];

        if (patientIds.length > 0) {
          // Get Total Sessions and sum duration
          const { data: allPatientSessions } = await (supabase.from('sessions') as any)
            .select('id, duration')
            .in('user_id', patientIds);
          
          setSessionCount(allPatientSessions?.length || 0);
          const totalSec = (allPatientSessions || []).reduce((acc: number, s: any) => acc + (Number(s.duration) || 0), 0);
          setTotalPracticeSeconds(totalSec);

          // Get Sessions needing review
          const { data: reviewSessions } = await (supabase.from('sessions') as any)
            .select(`
              id,
              created_at,
              duration,
              review_status,
              user_id,
              profiles!sessions_user_id_fkey ( full_name )
            `)
            .in('user_id', patientIds)
            .in('review_status', ['READY_FOR_REVIEW', 'REVIEW_PENDING'])
            .order('created_at', { ascending: false })
            .limit(10);
            
          setNeedsReviewSessions(reviewSessions || []);
        }

      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [profile?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
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
            <Search className="w-3.5 h-3.5" />
            Clinical Assistant
          </Link>
        </div>
      </div>

      {corsairError && (
        <div className="rounded-md bg-amber-50 p-4 border border-amber-200">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-800">Corsair Integration Offline</h3>
              <div className="mt-1 text-sm text-amber-700">
                <p>Unable to load dashboard data from Corsair DB. Showing local fallback data.</p>
                <p className="mt-1 opacity-80 text-xs">Internal error: {corsairError}</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
                {needsReviewSessions.map((session) => (
                  <Link 
                    key={session.id}
                    to={`/slp/patients/${session.user_id}`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="font-medium text-slate-900">
                        {session.profiles?.full_name || 'Patient'}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span>{new Date(session.created_at).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(session.duration)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">Pending</Badge>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </Link>
                ))}
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
                {recentSessions.slice(0, 5).map((session) => (
                  <Link 
                    key={session.id}
                    to={`/slp/patients/${session.user_id}`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="font-medium text-slate-900">
                        {session.profiles?.full_name || 'Patient'}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span>{new Date(session.created_at).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1 font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {formatDuration(session.duration)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </Link>
                ))}
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
