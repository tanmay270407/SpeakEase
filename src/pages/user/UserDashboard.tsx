import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/Avatar";
import { 
  PlayCircle, 
  Clock, 
  Calendar as CalendarIcon, 
  AlertCircle, 
  Bell, 
  CheckCircle2, 
  MessageSquare, 
  Activity, 
  BrainCircuit, 
  X, 
  ExternalLink 
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Session, Notification } from "../../types/supabase";
import { formatDuration } from "../../lib/utils";
import { connectionService } from "../../services/connectionService";
import { getExerciseDetailsById } from "../../data/exerciseDetailsData";
import { Stethoscope, UserPlus, HeartHandshake } from "lucide-react";
import { PatientLiveSessionsCard } from "../../components/patient/PatientLiveSessionsCard";

interface ReviewDetails {
  session: Session | null;
  metrics: any | null;
  observation: string | null;
  clinicianNote: any | null;
  slpProfile: any | null;
}

export function UserDashboard() {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeSLP, setActiveSLP] = useState<any | null>(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review modal state
  const [activeModalNotification, setActiveModalNotification] = useState<Notification | null>(null);
  const [reviewDetails, setReviewDetails] = useState<ReviewDetails | null>(null);
  const [loadingReviewDetails, setLoadingReviewDetails] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data, error: notifErr } = await (supabase
        .from('notifications') as any)
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!notifErr && data) {
        setNotifications(data as Notification[]);
      }
    } catch (err) {
      console.warn("Failed to fetch notifications:", err);
    }
  }, [profile?.id]);

  useEffect(() => {
    let isMounted = true;
    
    const fetchSessions = async () => {
      try {
        setLoading(true);
        // Fetch recent sessions for the current user
        const { data, error: fetchError } = await supabase
          .from('sessions')
          .select('*, exercises(name)')
          .eq('user_id', profile?.id || '')
          .order('created_at', { ascending: false })
          .limit(30);

        if (fetchError) throw fetchError;
        
        // Fetch clinical care connection
        if (profile?.id) {
          const [slpData, { data: reqs }] = await Promise.all([
            connectionService.getPatientActiveSLP(profile.id),
            (supabase.from('connection_requests') as any)
              .select('id')
              .eq('receiver_id', profile.id)
              .eq('status', 'pending')
          ]);
          if (isMounted) {
            setActiveSLP(slpData);
            setPendingRequestsCount(reqs?.length || 0);
          }
        }

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
      fetchNotifications();

      // Supabase Realtime channel for live notifications
      const channel = supabase
        .channel(`patient_notifs_${profile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${profile.id}`
          },
          () => {
            fetchNotifications();
          }
        )
        .subscribe();

      // Polling fallback every 15 seconds
      const pollInterval = setInterval(() => {
        fetchNotifications();
      }, 15000);

      return () => {
        isMounted = false;
        supabase.removeChannel(channel);
        clearInterval(pollInterval);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [profile?.id, fetchNotifications]);

  const handleOpenReview = async (notif: Notification) => {
    setActiveModalNotification(notif);
    setLoadingReviewDetails(true);

    // 1. Mark notification as read if unread
    if (!notif.is_read) {
      try {
        await (supabase
          .from('notifications') as any)
          .update({ is_read: true })
          .eq('id', notif.id);

        setNotifications(prev =>
          prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n)
        );
      } catch (e) {
        console.warn("Failed to mark notification as read:", e);
      }
    }

    // 2. Fetch session, metrics, observations, clinician note
    try {
      if (!notif.session_id) {
        setReviewDetails({
          session: null,
          metrics: null,
          observation: null,
          clinicianNote: null,
          slpProfile: null
        });
        return;
      }

      const [sessionRes, metricsRes, obsRes, noteRes] = await Promise.all([
        (supabase.from('sessions') as any).select('*').eq('id', notif.session_id).single(),
        (supabase.from('speech_metrics') as any).select('*').eq('session_id', notif.session_id).maybeSingle(),
        (supabase.from('ai_observations') as any).select('*').eq('session_id', notif.session_id).maybeSingle(),
        (supabase.from('clinician_notes') as any).select('*').eq('session_id', notif.session_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      ]);

      let slpProf = null;
      if (noteRes.data?.clinician_id) {
        const { data: slpData } = await (supabase.from('slps') as any)
          .select('full_name, professional_title')
          .eq('id', noteRes.data.clinician_id)
          .maybeSingle();
        slpProf = slpData;
      }

      setReviewDetails({
        session: sessionRes.data || null,
        metrics: metricsRes.data ? (metricsRes.data.metrics || metricsRes.data) : null,
        observation: obsRes.data ? (obsRes.data.observation_text || obsRes.data.observation) : null,
        clinicianNote: noteRes.data || null,
        slpProfile: slpProf
      });
    } catch (err) {
      console.error("Error loading review details:", err);
    } finally {
      setLoadingReviewDetails(false);
    }
  };

  const handleCloseModal = () => {
    setActiveModalNotification(null);
    setReviewDetails(null);
  };

  const firstName = profile?.full_name?.split(' ')[0] || '';

  // Calculate statistics
  const { thisWeekCount, thisWeekMinutes, recentSessions, chartData } = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Stats for "This week"
    let weekCount = 0;
    let weekSeconds = 0;
    
    // All sessions sorted newest first for internal scrolling
    const recent = sessions;
    
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

  const formatSessionDateTime = (dateString: string) => {
    try {
      const d = new Date(dateString);
      const day = d.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getMonth()];
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${day} ${month}, ${hours}:${mins}`;
    } catch {
      return new Date(dateString).toLocaleDateString();
    }
  };

  const getSessionTitle = (session: any) => {
    if (session.exercises?.name) return session.exercises.name;
    if (session.exercise_id) {
      const detail = getExerciseDetailsById(session.exercise_id);
      if (detail?.title) return detail.title;
      return "Exercise Routine";
    }
    return "Practice Session";
  };

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
        <div className="flex items-center gap-2">
          <Link 
            to="/practice"
            className="inline-flex h-10 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md items-center justify-center gap-2 text-sm font-medium transition-colors"
          >
            <PlayCircle className="h-4 w-4" />
            Start Practice
          </Link>
          <Link 
            to="/exercises"
            className="inline-flex h-10 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md items-center justify-center gap-2 text-sm font-medium transition-colors"
          >
            Browse Exercises
          </Link>
        </div>
      </div>

      {/* Clinical Care Connection Card */}
      <Card className="border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-white shadow-sm overflow-hidden">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative shrink-0">
              {activeSLP?.slps ? (
                <Link
                  to={activeSLP.slps.id ? `/slp-profile/${activeSLP.slps.id}` : "/my-slp"}
                  title="View Clinician Profile"
                  className="block group"
                >
                  <Avatar
                    src={activeSLP.slps.profile_image}
                    name={activeSLP.slps.full_name}
                    size="md"
                    theme="teal"
                    className="h-12 w-12 text-base rounded-full shadow-2xs border border-slate-200 group-hover:ring-2 group-hover:ring-teal-500/30 transition-all"
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 bg-teal-600 text-white p-1 rounded-full shadow-2xs ring-2 ring-white">
                    <Stethoscope className="w-2.5 h-2.5" />
                  </div>
                </Link>
              ) : (
                <div className="relative">
                  <Avatar
                    src={null}
                    name={null}
                    size="md"
                    theme="indigo"
                    className="h-12 w-12 text-base rounded-full shadow-2xs border border-indigo-100"
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 bg-indigo-600 text-white p-1 rounded-full shadow-2xs ring-2 ring-white">
                    <Stethoscope className="w-2.5 h-2.5" />
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Speech-Language Pathologist
                </span>
                {activeSLP ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                    Connected
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                    Not Connected
                  </span>
                )}
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                {activeSLP?.slps?.full_name ? activeSLP.slps.full_name : "Find & Connect with an SLP"}
              </h3>
              <p className="text-xs text-slate-500">
                {activeSLP?.slps
                  ? `${activeSLP.slps.specialization || 'Voice & Fluency'} • ${activeSLP.slps.organization || 'SpeakEase Clinical Care'}`
                  : "Connect with a licensed clinician to have your practice sessions reviewed."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {activeSLP ? (
              <Link to="/my-slp">
                <Button size="sm" variant="outline" className="text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                  View My SLP
                </Button>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                {pendingRequestsCount > 0 && (
                  <Link to="/connection-requests">
                    <Button size="sm" variant="outline" className="text-xs border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100">
                      {pendingRequestsCount} Pending {pendingRequestsCount === 1 ? 'Request' : 'Requests'}
                    </Button>
                  </Link>
                )}
                <Link to="/find-slps">
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
                    <UserPlus className="w-3.5 h-3.5 mr-1" />
                    Find SLPs
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Incoming Live Session Requests & Upcoming Appointments */}
      <PatientLiveSessionsCard />

      {/* Notifications Section - Compact Fixed-Height Card with Internal Scroll */}
      <Card className="border-slate-200 shadow-sm overflow-hidden flex flex-col h-[330px] sm:h-[350px]">
        <CardHeader className="py-3 px-4 bg-slate-50/80 border-b border-slate-100 flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-600 shrink-0" />
            <CardTitle className="text-sm font-semibold text-slate-900">Notifications</CardTitle>
          </div>
          {notifications.filter(n => !n.is_read).length > 0 ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
              {notifications.filter(n => !n.is_read).length} New
            </span>
          ) : (
            <span className="text-xs text-slate-400 font-medium">All caught up</span>
          )}
        </CardHeader>

        <CardContent className="p-0 flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 overscroll-contain">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 text-xs sm:text-sm">
              <Bell className="w-6 h-6 text-slate-300 mb-2 stroke-[1.5]" />
              <p className="font-medium text-slate-500">No new notifications</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Updates from your SLP and session reviews will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notif) => {
                const isUnread = !notif.is_read;
                const formattedDate = (() => {
                  try {
                    const d = new Date(notif.created_at);
                    const day = d.getDate();
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
                    const month = months[d.getMonth()];
                    const hours = String(d.getHours()).padStart(2, '0');
                    const mins = String(d.getMinutes()).padStart(2, '0');
                    return `${day} ${month}, ${hours}:${mins}`;
                  } catch {
                    return new Date(notif.created_at).toLocaleDateString();
                  }
                })();

                return (
                  <div
                    key={notif.id}
                    className={`p-3 sm:p-3.5 flex items-start justify-between gap-3 transition-colors ${
                      isUnread 
                        ? 'bg-indigo-50/40 hover:bg-indigo-50/70' 
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs sm:text-sm truncate ${isUnread ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>
                          {notif.title}
                        </span>
                        {isUnread ? (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-600 text-white">
                            New
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                            Read
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>
                      <p className="text-[11px] text-slate-400 font-medium">
                        {formattedDate}
                      </p>
                    </div>
                    <div className="shrink-0 pt-0.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenReview(notif)}
                        className="text-xs h-7 px-2.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800 font-medium"
                      >
                        {notif.type === 'SLP_REVIEW' || notif.session_id ? 'View Review' : 'View Details'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-slate-200 shadow-sm flex flex-col justify-between h-[330px] sm:h-[350px]">
          <CardHeader className="py-3 px-4 bg-slate-50/80 border-b border-slate-100 shrink-0">
            <CardTitle className="text-sm font-semibold text-slate-900">This week</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex-1 flex flex-col justify-center gap-6">
            <div className="space-y-1">
              <div className="text-3xl font-bold text-slate-900">{thisWeekCount}</div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed Sessions</div>
            </div>
            <div className="space-y-1 pt-4 border-t border-slate-100">
              <div className="text-3xl font-bold text-slate-900">{thisWeekMinutes}</div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Practice Minutes</div>
            </div>
          </CardContent>
        </Card>

        {/* Sessions Card - Compact Fixed-Height Card with Internal Scroll */}
        <Card className="border-slate-200 shadow-sm overflow-hidden flex flex-col h-[330px] sm:h-[350px]">
          <CardHeader className="py-3 px-4 bg-slate-50/80 border-b border-slate-100 flex flex-row items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600 shrink-0" />
              <CardTitle className="text-sm font-semibold text-slate-900">Sessions</CardTitle>
            </div>
            <Link 
              to="/sessions" 
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              View All
            </Link>
          </CardHeader>
          
          <CardContent className="p-0 flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 overscroll-contain">
            {recentSessions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 text-xs sm:text-sm">
                <PlayCircle className="w-6 h-6 text-slate-300 mb-2 stroke-[1.5]" />
                <p className="font-medium text-slate-500">No practice sessions yet.</p>
                <Link to="/practice" className="mt-3">
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 px-3">
                    Start Practice
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentSessions.map((session) => {
                  const title = getSessionTitle(session);
                  const dateTime = formatSessionDateTime(session.created_at);
                  const durationStr = formatDuration(session.duration);
                  const isReviewed = session.review_status === 'REVIEWED';

                  return (
                    <Link
                      key={session.id}
                      to="/sessions"
                      className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors block"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 text-xs sm:text-sm truncate">
                          {title}
                        </div>
                        <div className="text-[11px] sm:text-xs text-slate-500 font-medium flex items-center gap-1.5">
                          <span>{dateTime}</span>
                          <span>·</span>
                          <span className="font-mono">{durationStr}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isReviewed ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Reviewed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            Needs Review
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
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

      {/* Clinician Review Modal */}
      {activeModalNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Clinician Session Review</h3>
                  <p className="text-xs text-slate-500">Feedback and automated metrics from your practice session</p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-200/50 transition-colors"
                aria-label="Close review dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {loadingReviewDetails ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
                  <p className="text-xs text-slate-500">Loading session review details...</p>
                </div>
              ) : (
                <>
                  {/* Non-diagnostic cautious clinical notice */}
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 leading-relaxed">
                    <span className="font-semibold">Clinical Note:</span> Observations and speech metrics are cautious, non-diagnostic indicators to support your guided speech exercises and do not claim medical severity.
                  </div>

                  {/* Session info */}
                  <div className="p-4 bg-slate-50 rounded-md border border-slate-200 grid sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-slate-500 block">Session Date</span>
                      <span className="font-medium text-slate-800">
                        {reviewDetails?.session?.created_at
                          ? new Date(reviewDetails.session.created_at).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : 'Recorded Session'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">Duration</span>
                      <span className="font-medium text-slate-800">
                        {reviewDetails?.session?.duration ? formatDuration(reviewDetails.session.duration) : '--:--'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">Review Status</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                        Reviewed
                      </span>
                    </div>
                  </div>

                  {/* Speech Metrics */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-slate-500" />
                      Speech Metrics
                    </h4>
                    {reviewDetails?.metrics ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="p-3 bg-white border border-slate-200 rounded-md">
                          <span className="text-xs text-slate-500 block">Speech Rate</span>
                          <span className="text-lg font-semibold text-slate-900">
                            {reviewDetails.metrics.speech_rate ?? '--'} <span className="text-xs font-normal text-slate-500">wpm</span>
                          </span>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-md">
                          <span className="text-xs text-slate-500 block">Possible Repetitions</span>
                          <span className="text-lg font-semibold text-slate-900">
                            {reviewDetails.metrics.repetitions ?? 0}
                          </span>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-md">
                          <span className="text-xs text-slate-500 block">Pauses</span>
                          <span className="text-lg font-semibold text-slate-900">
                            {reviewDetails.metrics.pauses ?? 0}
                          </span>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-md">
                          <span className="text-xs text-slate-500 block">Possible Prolongations</span>
                          <span className="text-lg font-semibold text-slate-900">
                            {reviewDetails.metrics.prolongations ?? 0}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-md">No metrics recorded for this session.</p>
                    )}
                  </div>

                  {/* AI Speech Observations */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <BrainCircuit className="w-3.5 h-3.5 text-indigo-500" />
                      AI Speech Observations
                    </h4>
                    <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-md text-xs text-indigo-950 leading-relaxed">
                      {reviewDetails?.observation || "No automated observations recorded for this session."}
                    </div>
                  </div>

                  {/* SLP Feedback */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-teal-600" />
                      SLP Feedback
                    </h4>
                    {reviewDetails?.clinicianNote ? (
                      <div className="p-4 bg-teal-50/70 border border-teal-200/80 rounded-md space-y-2">
                        <p className="text-sm text-teal-950 whitespace-pre-wrap leading-relaxed font-normal">
                          {reviewDetails.clinicianNote.note}
                        </p>
                        <div className="pt-2 border-t border-teal-200/50 flex items-center justify-between text-xs text-teal-700">
                          <span className="flex items-center gap-1.5">
                            {reviewDetails.slpProfile && (
                              <Avatar
                                src={reviewDetails.slpProfile.profile_image}
                                name={reviewDetails.slpProfile.full_name}
                                size="sm"
                                theme="teal"
                                className="w-5 h-5 text-[9px]"
                              />
                            )}
                            <span>
                              {reviewDetails.slpProfile?.full_name 
                                ? `Reviewed by ${reviewDetails.slpProfile.full_name}${reviewDetails.slpProfile.professional_title ? ` (${reviewDetails.slpProfile.professional_title})` : ''}`
                                : 'Reviewed by Speech Language Pathologist'}
                            </span>
                          </span>
                          <span>
                            {new Date(reviewDetails.clinicianNote.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-md">
                        Review in progress. Clinician feedback will appear here once submitted.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              {reviewDetails?.session?.id ? (
                <Link
                  to={reviewDetails.session.exercise_id ? `/exercises/${reviewDetails.session.exercise_id}/results/${reviewDetails.session.id}` : `/practice/${reviewDetails.session.id}`}
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                >
                  Full Session Details
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              ) : <div />}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCloseModal}
              >
                Close
              </Button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
