import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { LiveSession } from "../../types/supabase";
import { SLPBookSessionModal } from "./SLPBookSessionModal";
import { SLPAvailabilityManager } from "./SLPAvailabilityManager";
import { LiveVideoCallModal } from "../live/LiveVideoCallModal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Avatar } from "../Avatar";
import {
  Calendar,
  Clock,
  Video,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Settings,
  User,
  Sparkles,
  PhoneCall,
  Check,
  X,
  RefreshCw
} from "lucide-react";

interface SLPLiveSessionsSectionProps {
  filterPatientId?: string;
}

export function SLPLiveSessionsSection({ filterPatientId }: SLPLiveSessionsSectionProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slpId, setSlpId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"upcoming" | "availability" | "history">("upcoming");
  const [sessions, setSessions] = useState<LiveSession[]>([]);

  // Modals state
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [selectedCallSession, setSelectedCallSession] = useState<LiveSession | null>(null);

  const fetchSLPSessions = async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      setError(null);

      // Fetch SLP profile ID
      const { data: slpData, error: slpErr } = await (supabase.from("slps") as any)
        .select("id")
        .eq("user_id", profile.id)
        .single();

      if (slpErr || !slpData) throw new Error("SLP record not found.");
      setSlpId(slpData.id);

      // Query live_sessions joining patient profiles
      let query = (supabase.from("live_sessions") as any)
        .select(`
          *,
          patient:patient_id ( id, full_name, email, avatar_url )
        `)
        .eq("slp_id", slpData.id)
        .order("scheduled_start", { ascending: true });

      if (filterPatientId) {
        query = query.eq("patient_id", filterPatientId);
      }

      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      setSessions(data || []);
    } catch (err: any) {
      console.error("Error fetching SLP live sessions:", err);
      setError(err.message || "Failed to load live sessions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSLPSessions();

    // Supabase Realtime subscription on live_sessions
    const channel = supabase
      .channel("slp_live_sessions_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_sessions"
        },
        () => {
          fetchSLPSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, filterPatientId]);

  // Handle Accept / Reject request from Patient
  const handleUpdateStatus = async (sessionId: string, newStatus: "confirmed" | "rejected" | "cancelled") => {
    try {
      const { error: err } = await (supabase.from("live_sessions") as any)
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", sessionId);

      if (err) throw err;

      // Send notification to patient
      const sessObj = sessions.find((s) => s.id === sessionId);
      if (sessObj?.patient_id) {
        const notifTitle =
          newStatus === "confirmed"
            ? "Session Request Accepted"
            : newStatus === "rejected"
            ? "Session Request Declined"
            : "Session Cancelled";

        await (supabase.from("notifications") as any).insert({
          user_id: sessObj.patient_id,
          session_id: sessionId,
          type: "live_session_status",
          title: notifTitle,
          message: `Your clinician updated the live session status to ${newStatus}.`,
          is_read: false
        });
      }

      fetchSLPSessions();
    } catch (err: any) {
      console.error("Status update failed:", err);
      alert(err.message || "Failed to update session status.");
    }
  };

  const upcomingSessions = sessions.filter(
    (s) => s.status === "confirmed" || s.status === "pending"
  );

  const pastSessions = sessions.filter(
    (s) => s.status === "completed" || s.status === "cancelled" || s.status === "rejected"
  );

  const formatDateTimeStr = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    } catch {
      return isoStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Confirmed</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending Request</Badge>;
      case "completed":
        return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Completed</Badge>;
      case "rejected":
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Declined</Badge>;
      case "cancelled":
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Cancelled</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-700">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        {/* Tab Switcher */}
        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "upcoming"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Upcoming ({upcomingSessions.length})
            </span>
          </button>

          <button
            onClick={() => setActiveTab("availability")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "availability"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              My Availability
            </span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "history"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Past Sessions ({pastSessions.length})
            </span>
          </button>
        </div>

        {/* Action Button */}
        <Button
          onClick={() => setIsBookModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer font-medium"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Book Live Session
        </Button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === "availability" ? (
        <SLPAvailabilityManager />
      ) : activeTab === "upcoming" ? (
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Scheduled & Pending Live Appointments
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Live speech therapy sessions booked with your connected patients
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchSLPSessions}
                className="text-slate-500 hover:text-slate-800"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mx-auto" />
              </div>
            ) : upcomingSessions.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto">
                  <Video className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800">No upcoming live sessions</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Book a video speech appointment with your assigned patient or share your available weekly slots.
                </p>
                <Button
                  onClick={() => setIsBookModalOpen(true)}
                  size="sm"
                  className="bg-indigo-600 text-white hover:bg-indigo-700 mt-2"
                >
                  Schedule Session
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {upcomingSessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <Avatar
                        src={session.patient?.avatar_url}
                        name={session.patient?.full_name || "Patient"}
                        size="md"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-sm">
                            {session.patient?.full_name || "Patient"}
                          </span>
                          {getStatusBadge(session.status)}
                          <span className="text-xs text-slate-500 font-medium">
                            ({session.duration} mins)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-indigo-700 font-semibold">
                          <Calendar className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          <span>{formatDateTimeStr(session.scheduled_start)}</span>
                        </div>
                        {session.purpose && (
                          <p className="text-xs text-slate-500 truncate">
                            Note: {session.purpose}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {session.status === "pending" && session.requested_by === "patient" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleUpdateStatus(session.id, "confirmed")}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Accept Request
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateStatus(session.id, "rejected")}
                            className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs h-8 px-2.5"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : session.status === "confirmed" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => setSelectedCallSession(session)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 shadow-xs"
                          >
                            <Video className="h-3.5 w-3.5 mr-1.5" />
                            Start Live Call
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateStatus(session.id, "cancelled")}
                            className="text-slate-500 hover:text-rose-600 text-xs h-8 px-2.5"
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Awaiting Patient Response</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* History Tab */
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">Past Live Session History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pastSessions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No past live sessions record found.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pastSessions.map((session) => (
                  <div key={session.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={session.patient?.avatar_url}
                        name={session.patient?.full_name || "Patient"}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{session.patient?.full_name}</p>
                        <p className="text-xs text-slate-500">{formatDateTimeStr(session.scheduled_start)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(session.status)}
                      <span className="text-xs font-mono text-slate-500">{session.duration} min</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Book Live Session Modal */}
      <SLPBookSessionModal
        isOpen={isBookModalOpen}
        onClose={() => setIsBookModalOpen(false)}
        preselectedPatientId={filterPatientId}
        onSuccess={fetchSLPSessions}
      />

      {/* Live Video Call Room Modal */}
      {selectedCallSession && (
        <LiveVideoCallModal
          isOpen={!!selectedCallSession}
          session={selectedCallSession}
          onClose={() => {
            setSelectedCallSession(null);
            fetchSLPSessions();
          }}
          userRole="slp"
        />
      )}
    </div>
  );
}
