import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { AlertCircle, Clock, ChevronRight, PlayCircle, Video, History, ChevronLeft } from "lucide-react";
import { formatDuration } from "../../lib/utils";
import { calculatePracticeLevel } from "../../lib/practiceLevel";
import { getExerciseDetailsById } from "../../data/exerciseDetailsData";
import { UserLiveSessionsSection } from "../../components/patient/UserLiveSessionsSection";

export function UserSessions() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<"live" | "recorded">("live");
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    async function loadSessions() {
      try {
        setLoading(true);
        if (!profile?.id) return;

        // Fetch sessions with exercises and speech_metrics
        const { data, error } = await (supabase.from('sessions') as any)
          .select(`
            *,
            exercises ( name ),
            speech_metrics ( repetitions, pauses, prolongations, speech_rate )
          `)
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSessions(data || []);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load sessions.');
      } finally {
        setLoading(false);
      }
    }

    loadSessions();
  }, [profile?.id]);

  const getSessionTitle = (session: any) => {
    if (session.exercises?.name) return session.exercises.name;
    if (session.exercise_id) {
      const detail = getExerciseDetailsById(session.exercise_id);
      if (detail?.title) return detail.title;
      return 'Exercise Routine';
    }
    return 'Practice Session';
  };

  const formatSessionDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const day = d.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getMonth()];
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${day} ${month}, ${hours}:${mins}`;
    } catch {
      return new Date(dateStr).toLocaleDateString();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REVIEWED':
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal text-xs">Reviewed</Badge>;
      case 'REVIEW_PENDING':
      case 'READY_FOR_REVIEW':
      case 'NOT_REVIEWED':
      default:
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal text-xs">Needs Review</Badge>;
    }
  };

  const getPracticeLevelBadge = (session: any) => {
    const metrics = Array.isArray(session.speech_metrics) 
      ? session.speech_metrics[0] 
      : session.speech_metrics;
    
    if (!metrics) return null;
    const { level } = calculatePracticeLevel(metrics);

    let colorClass = 'bg-slate-100 text-slate-700 border-slate-200';
    if (level === 'Strong Progress') colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    else if (level === 'Good Progress') colorClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    else if (level === 'Developing') colorClass = 'bg-blue-50 text-blue-700 border-blue-200';
    else if (level === 'Needs Practice') colorClass = 'bg-amber-50 text-amber-700 border-amber-200';

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${colorClass}`}>
        {level}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sessions</h1>
          <p className="text-slate-500 text-sm">Your live speech therapy appointments and exercise history.</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          <button
            onClick={() => setActiveTab("live")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "live"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Video className="h-3.5 w-3.5" />
              Live Appointments
            </span>
          </button>

          <button
            onClick={() => setActiveTab("recorded")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "recorded"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              Practice History
            </span>
          </button>
        </div>
      </div>

      {activeTab === "live" ? (
        <UserLiveSessionsSection />
      ) : (
        /* Recorded Practice History */
        loading ? (
          <ListSkeleton count={5} />
        ) : error ? (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 border border-red-200 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : (
          <Card className="border-slate-200 shadow-xs overflow-hidden flex flex-col min-h-[420px]">
            <CardContent className="p-0 flex-1 overflow-y-auto min-h-0">
              {sessions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 min-h-[300px]">
                  <PlayCircle className="w-10 h-10 text-slate-300 mb-3 stroke-[1.5]" />
                  <p className="text-base font-semibold text-slate-700">No practice sessions yet.</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Start your first speech practice or exercise session to track metrics and get clinical feedback.
                  </p>
                  <Link to="/practice" className="mt-4">
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4 font-medium">
                      Start Practice
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sessions.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((session) => (
                    <Link 
                      key={session.id} 
                      to={session.exercise_id ? `/exercises/${session.exercise_id}/results/${session.id}` : `/practice/${session.id}`}
                      className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors block"
                    >
                      <div className="space-y-1 min-w-0 flex-1 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-sm truncate">
                            {getSessionTitle(session)}
                          </span>
                          {getPracticeLevelBadge(session)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                          <span>{formatSessionDateTime(session.created_at)}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {formatDuration(session.duration)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {getStatusBadge(session.review_status)}
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>

            {/* Pagination Controls */}
            {sessions.length > pageSize && (
              <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Showing {Math.min((currentPage - 1) * pageSize + 1, sessions.length)}–
                  {Math.min(currentPage * pageSize, sessions.length)} of {sessions.length} sessions
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="h-8 px-2.5 text-xs gap-1 bg-white"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Previous
                  </Button>
                  <span className="font-medium px-1">{currentPage} / {Math.ceil(sessions.length / pageSize)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage >= Math.ceil(sessions.length / pageSize)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(sessions.length / pageSize), prev + 1))}
                    className="h-8 px-2.5 text-xs gap-1 bg-white"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )
      )}
    </div>
  );
}
