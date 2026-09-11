import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { PlayCircle, Clock, Calendar as CalendarIcon, TrendingUp, AlertCircle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Session } from "../../types/supabase";

export function UserDashboard() {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const fetchSessions = async () => {
      try {
        setLoading(true);
        // Fetch recent sessions for the current user
        const { data, error: fetchError } = await supabase
          .from('sessions')
          .select('*')
          .eq('user_id', profile?.id || '')
          .order('created_at', { ascending: false })
          .limit(30);

        if (fetchError) throw fetchError;
        
        if (isMounted) {
          setSessions(data || []);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load dashboard data');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (profile?.id) {
      fetchSessions();
    }

    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  const firstName = profile?.full_name?.split(' ')[0] || '';

  // Calculate statistics
  const { thisWeekCount, thisWeekMinutes, recentSessions, chartData } = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Stats for "This week"
    let weekCount = 0;
    let weekSeconds = 0;
    
    const recent = sessions.slice(0, 3);
    
    // Chart data mapping (last 7 days activity in minutes)
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const activityMap = new Map<string, number>();
    
    // Initialize last 7 days with 0
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayName = days[d.getDay()];
      activityMap.set(dayName, 0);
    }

    sessions.forEach(session => {
      const sessionDate = new Date(session.created_at);
      if (sessionDate > oneWeekAgo) {
        weekCount++;
        weekSeconds += session.duration || 0;
        
        const dayName = days[sessionDate.getDay()];
        if (activityMap.has(dayName)) {
          activityMap.set(dayName, activityMap.get(dayName)! + (session.duration / 60));
        }
      }
    });

    const formattedChartData = Array.from(activityMap.entries()).map(([day, minutes]) => ({
      day,
      minutes: Math.round(minutes)
    }));

    return {
      thisWeekCount: weekCount,
      thisWeekMinutes: Math.round(weekSeconds / 60),
      recentSessions: recent,
      chartData: formattedChartData
    };
  }, [sessions]);

  const formatSessionDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 border border-red-200 flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Good morning{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-slate-500 text-sm">Here is your practice summary.</p>
        </div>
        <Link 
          to="/exercises"
          className="inline-flex h-10 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md items-center justify-center gap-2 text-sm font-medium transition-colors"
        >
          <PlayCircle className="h-4 w-4" />
          Start Practice
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-slate-200 shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium text-slate-500">This week</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end gap-6">
            <div>
              <div className="text-3xl font-bold text-slate-900">{thisWeekCount}</div>
              <div className="text-sm text-slate-500">Sessions</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900">{thisWeekMinutes}</div>
              <div className="text-sm text-slate-500">Minutes</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium text-slate-500">Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentSessions.length === 0 ? (
              <div className="text-sm text-slate-500 italic py-2">No practice sessions yet.</div>
            ) : (
              recentSessions.map(session => (
                <div key={session.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-700">
                    <CalendarIcon className="h-4 w-4 text-slate-400" />
                    <span>{formatSessionDate(session.created_at)}</span>
                  </div>
                  <span className="text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatDuration(session.duration)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-8">
          <div>
            <CardTitle className="text-base font-medium text-slate-900">Activity</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '6px', border: '1px solid #e2e8f0', boxShadow: 'none' }}
                  itemStyle={{ color: '#0f172a', fontWeight: 500 }}
                  formatter={(value: number) => [`${value} min`, 'Practice Time']}
                />
                <Area type="monotone" dataKey="minutes" stroke="#4f46e5" strokeWidth={2} fillOpacity={0.05} fill="#4f46e5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
