import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { AlertCircle, Activity, Info, Clock } from "lucide-react";
import { formatDuration } from "../../lib/utils";

export function UserProgress() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [sessions, setSessions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);

  useEffect(() => {
    async function loadProgress() {
      try {
        setLoading(true);
        if (!profile?.id) return;

        const { data: sessionData, error: sessionError } = await (supabase.from('sessions') as any)
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: true });

        if (sessionError) throw sessionError;

        const sessionIds = sessionData?.map((s: any) => s.id) || [];
        
        let metricsData: any[] = [];
        if (sessionIds.length > 0) {
          const { data: mData, error: mError } = await (supabase.from('speech_metrics') as any)
            .select('*')
            .in('session_id', sessionIds);
            
          if (mError) throw mError;
          metricsData = mData || [];
        }

        setSessions(sessionData || []);
        setMetrics(metricsData);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load progress data.');
      } finally {
        setLoading(false);
      }
    }

    loadProgress();
  }, [profile?.id]);

  const { activityData, observationData, weeklySeconds, monthlySeconds, totalSeconds } = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    let weekly = 0;
    let monthly = 0;
    let total = 0;

    for (const s of sessions) {
      const dur = Number(s.duration) || 0;
      total += dur;
      const createdAtTime = new Date(s.created_at).getTime();
      if (createdAtTime >= sevenDaysAgo) {
        weekly += dur;
      }
      if (createdAtTime >= thirtyDaysAgo) {
        monthly += dur;
      }
    }

    // Process for Practice Activity (Duration over time)
    const actData = sessions.map(s => ({
      date: new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      minutes: Math.round(((Number(s.duration) || 0) / 60) * 10) / 10
    }));

    // Process for Speech Observations (Repetitions, Pauses)
    // Join sessions with metrics to ensure chronological order
    const obsData = sessions
      .map(s => {
        const match = metrics.find(m => m.session_id === s.id);
        if (!match) return null;
        return {
          date: new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          repetitions: match.repetitions || 0,
          pauses: match.pauses || 0
        };
      })
      .filter(Boolean);

    return { 
      activityData: actData, 
      observationData: obsData,
      weeklySeconds: weekly,
      monthlySeconds: monthly,
      totalSeconds: total
    };
  }, [sessions, metrics]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Progress Tracking</h1>
          <p className="text-slate-500 text-sm">Longitudinal speech metrics and therapy practice trends.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 border border-red-200 flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-1 pb-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Progress</h1>
        <p className="text-slate-500 text-sm">Track your practice activity and session trends over time.</p>
      </div>

      <div className="rounded-md bg-slate-50 p-4 border border-slate-200 flex gap-3 text-sm text-slate-600">
        <Info className="h-5 w-5 text-slate-400 flex-shrink-0" />
        <p>
          These metrics and charts represent real audio practice sessions. 
          <span className="font-medium text-slate-700"> Practice times reflect the exact duration of your recorded speech.</span> Always consult your SLP for clinical evaluation.
        </p>
      </div>

      {/* Real Recording Practice Time Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-md">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Weekly Practice</p>
                <p className="text-2xl font-bold text-slate-900">{formatDuration(weeklySeconds)}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">Sum of actual audio recordings (last 7 days)</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-md">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Monthly Practice</p>
                <p className="text-2xl font-bold text-slate-900">{formatDuration(monthlySeconds)}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">Sum of actual audio recordings (last 30 days)</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-md">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Practice</p>
                <p className="text-2xl font-bold text-slate-900">{formatDuration(totalSeconds)}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">All-time recorded audio duration</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Practice activity</CardTitle>
            <CardDescription>Minutes practiced per session</CardDescription>
          </CardHeader>
          <CardContent>
            {activityData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-sm text-slate-400 italic">
                No practice data yet
              </div>
            ) : (
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '6px', border: '1px solid #e2e8f0', boxShadow: 'none' }}
                      formatter={(value: number) => [`${value} min`, 'Practice Time']}
                    />
                    <Bar dataKey="minutes" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Session trend</CardTitle>
            <CardDescription>Possible repetitions observed over time</CardDescription>
          </CardHeader>
          <CardContent>
            {observationData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-sm text-slate-400 italic">
                No observation data yet
              </div>
            ) : (
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={observationData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '6px', border: '1px solid #e2e8f0', boxShadow: 'none' }}
                      formatter={(value: number) => [value, 'Possible Repetitions']}
                    />
                    <Area type="monotone" dataKey="repetitions" stroke="#0ea5e9" strokeWidth={2} fillOpacity={0.05} fill="#0ea5e9" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
