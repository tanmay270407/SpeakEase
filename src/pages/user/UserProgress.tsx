import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { AlertCircle, Activity, Info } from "lucide-react";

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

  const { activityData, observationData } = useMemo(() => {
    // Process for Practice Activity (Duration over time)
    const actData = sessions.map(s => ({
      date: new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      minutes: Math.round(s.duration / 60 * 10) / 10
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

    return { activityData: actData, observationData: obsData };
  }, [sessions, metrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
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
          These charts represent automated observations of your practice activity. 
          <span className="font-medium text-slate-700"> They are not medical diagnoses and do not explicitly prove clinical improvement.</span> Always consult your SLP for clinical evaluation.
        </p>
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
