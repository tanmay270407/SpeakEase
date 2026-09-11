import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { AlertCircle, Clock, ChevronRight } from "lucide-react";

export function UserSessions() {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSessions() {
      try {
        setLoading(true);
        if (!profile?.id) return;

        // Fetch sessions and optionally join with exercises if possible
        const { data, error } = await (supabase.from('sessions') as any)
          .select(`
            *,
            exercises ( name )
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REVIEWED':
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal">Reviewed</Badge>;
      case 'REVIEW_PENDING':
      case 'READY_FOR_REVIEW':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">Needs Review</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100 font-normal">Not Reviewed</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sessions</h1>
        <p className="text-slate-500 text-sm">Your practice session history.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 italic">
              No sessions found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sessions.map((session) => (
                <Link 
                  key={session.id} 
                  to={`/practice/${session.id}`}
                  className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="font-medium text-slate-900">
                      {session.exercises?.name || 'General Practice'}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <span>{new Date(session.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(session.duration)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {getStatusBadge(session.review_status)}
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
