import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { LiveSession } from "../../types/supabase";
import { PatientBookSessionModal } from "./PatientBookSessionModal";
import { LiveVideoCallModal } from "../live/LiveVideoCallModal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Avatar } from "../Avatar";
import {
  Calendar,
  Clock,
  Video,
  CheckCircle2,
  AlertCircle,
  User,
  Check,
  X,
  RefreshCw,
  Plus,
  Send,
  History,
  Inbox,
  Ban
} from "lucide-react";

export function UserLiveSessionsSection() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upcoming" | "requests" | "past">("upcoming");
  const [sessions, setSessions] = useState<LiveSession[]>([]);

  // Modal state
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [selectedCallSession, setSelectedCallSession] = useState<LiveSession | null>(null);
  const [cancelModalSession, setCancelModalSession] = useState<LiveSession | null>(null);

  const fetchUserLiveSessions = async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchErr } = await (supabase.from("live_sessions") as any)
        .select(`
          *,
          slp:slp_id ( id, full_name, email, profile_image, professional_title, specialization )
        `)
        .eq("patient_id", profile.id)
        .order("scheduled_start", { ascending: true });

      if (fetchErr) throw fetchErr;

      setSessions(data || []);
    } catch (err: any) {
      console.error("Error fetching user live sessions:", err);
      setError(err.message || "Failed to load appointments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserLiveSessions();

    // Subscribe to realtime live_sessions changes for patient
    const channel = supabase
      .channel("user_live_sessions_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_sessions",
          filter: `patient_id=eq.${profile?.id}`
        },
        () => {
          fetchUserLiveSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Handle Accept / Decline session request from clinician
  const handleUpdateStatus = async (sessionId: string, newStatus: "confirmed" | "rejected" | "cancelled") => {
    try {
      const { error: err } = await (supabase.from("live_sessions") as any)
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", sessionId);

      if (err) throw err;

      // Send notification to clinician
      const sessObj = sessions.find((s) => s.id === sessionId);
      if (sessObj?.slp_id) {
        const { data: slpRec } = await (supabase.from("slps") as any)
          .select("user_id")
          .eq("id", sessObj.slp_id)
          .single();

        if (slpRec?.user_id) {
          const notifTitle =
            newStatus === "confirmed"
              ? "Patient Confirmed Session"
              : newStatus === "rejected"
              ? "Patient Declined Session"
              : "Session Cancelled";

          await (supabase.from("notifications") as any).insert({
            user_id: slpRec.user_id,
            session_id: sessionId,
            type: "live_session_status",
            title: notifTitle,
            message: `${profile?.full_name || "Patient"} ${newStatus} the live session request.`,
            is_read: false
          });
        }
      }

      setCancelModalSession(null);
      fetchUserLiveSessions();
    } catch (err: any) {
      console.error("Status update error:", err);
      alert(err.message || "Failed to update appointment status.");
    }
  };

  const upcomingConfirmedSessions = sessions.filter(
    (s) => s.status === "confirmed" && new Date(s.scheduled_end) > new Date()
  );

  const pendingRequests = sessions.filter((s) => s.status === "pending");

  const pastSessions = sessions.filter(
    (s) =>
      s.status === "completed" ||
      s.status === "cancelled" ||
      s.status === "rejected" ||
      (s.status === "confirmed" && new Date(s.scheduled_end) <= new Date())
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

  const getStatusBadge = (session: LiveSession) => {
    switch (session.status) {
      case "confirmed":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Confirmed</Badge>;
      case "pending":
        if (session.requested_by === "patient") {
          return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Requested by you</Badge>;
        }
        return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Requested by SLP</Badge>;
      case "completed":
        return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Completed</Badge>;
      case "rejected":
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Declined</Badge>;
      case "cancelled":
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Cancelled</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-700">{session.status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Bar & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        {/* Navigation Tabs */}
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
              Upcoming ({upcomingConfirmedSessions.length})
            </span>
          </button>

          <button
            onClick={() => setActiveTab("requests")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer relative ${
              activeTab === "requests"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" />
              Requests ({pendingRequests.length})
              {pendingRequests.filter((s) => s.requested_by === "slp").length > 0 && (
                <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
              )}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("past")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "past"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              Past Sessions ({pastSessions.length})
            </span>
          </button>
        </div>

        {/* Book Live Session Button */}
        <Button
          onClick={() => setIsBookModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer font-medium text-xs h-9 px-4"
          id="patient-book-session-btn"
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

      {/* 1. UPCOMING TAB */}
      {activeTab === "upcoming" && (
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Video className="h-5 w-5 text-indigo-600" />
                  Confirmed Live Video Appointments
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Scheduled real-time therapy sessions with your speech clinician
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchUserLiveSessions}
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
            ) : upcomingConfirmedSessions.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto">
                  <Video className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800">No confirmed upcoming sessions</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  You have no active confirmed video calls. Request a new session with your clinician or view pending requests.
                </p>
                <Button
                  onClick={() => setIsBookModalOpen(true)}
                  size="sm"
                  className="bg-indigo-600 text-white hover:bg-indigo-700 mt-2 text-xs"
                >
                  Request Live Session
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {upcomingConfirmedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <Avatar
                        src={(session as any).slp?.profile_image || (session as any).slp?.avatar_url}
                        name={(session as any).slp?.full_name || "Clinician"}
                        size="md"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-sm">
                            {(session as any).slp?.full_name || "Speech Clinician"}
                          </span>
                          {getStatusBadge(session)}
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
                            Purpose: {session.purpose}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCancelModalSession(session)}
                        className="text-slate-500 hover:text-rose-600 text-xs h-8 px-2.5"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setSelectedCallSession(session)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3.5 shadow-xs"
                      >
                        <Video className="h-3.5 w-3.5 mr-1.5" />
                        Join Video Call
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2. REQUESTS TAB */}
      {activeTab === "requests" && (
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Inbox className="h-5 w-5 text-indigo-600" />
                  Pending Session Requests
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Live session invitations sent by you or your Speech Language Pathologist
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchUserLiveSessions}
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
            ) : pendingRequests.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mx-auto">
                  <Inbox className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800">No pending session requests</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  When you or your clinician submit a live session request, it will appear here awaiting confirmation.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingRequests.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <Avatar
                        src={(session as any).slp?.profile_image || (session as any).slp?.avatar_url}
                        name={(session as any).slp?.full_name || "Clinician"}
                        size="md"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-sm">
                            {(session as any).slp?.full_name || "Speech Clinician"}
                          </span>
                          {getStatusBadge(session)}
                          <span className="text-xs text-slate-500 font-medium">
                            ({session.duration} mins)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-indigo-700 font-semibold">
                          <Calendar className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          <span>{formatDateTimeStr(session.scheduled_start)}</span>
                        </div>
                        {session.purpose && (
                          <p className="text-xs text-slate-600 italic truncate">
                            "{session.purpose}"
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400 font-medium">
                          {session.requested_by === "patient"
                            ? "Requested by you · Awaiting SLP confirmation"
                            : "Requested by clinician · Needs your response"}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {session.requested_by === "slp" ? (
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
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCancelModalSession(session)}
                          className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs h-8 px-3"
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          Cancel Request
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 3. PAST SESSIONS TAB */}
      {activeTab === "past" && (
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-800">Past Live Session History</CardTitle>
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
                        src={(session as any).slp?.profile_image || (session as any).slp?.avatar_url}
                        name={(session as any).slp?.full_name || "Clinician"}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{(session as any).slp?.full_name}</p>
                        <p className="text-xs text-slate-500">{formatDateTimeStr(session.scheduled_start)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(session)}
                      <span className="text-xs font-mono text-slate-500">{session.duration} min</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Patient Book Session Modal */}
      <PatientBookSessionModal
        isOpen={isBookModalOpen}
        onClose={() => setIsBookModalOpen(false)}
        onSuccess={fetchUserLiveSessions}
      />

      {/* Cancellation Modal */}
      {cancelModalSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Cancel Live Session?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to cancel this live session request/appointment? This action will inform your clinician.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelModalSession(null)}
              >
                Keep Session
              </Button>
              <Button
                size="sm"
                onClick={() => handleUpdateStatus(cancelModalSession.id, "cancelled")}
                className="bg-red-600 hover:bg-red-700 text-white text-xs"
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Live Video Call Room Modal */}
      {selectedCallSession && (
        <LiveVideoCallModal
          isOpen={!!selectedCallSession}
          session={selectedCallSession}
          onClose={() => {
            setSelectedCallSession(null);
            fetchUserLiveSessions();
          }}
          userRole="patient"
        />
      )}
    </div>
  );
}

export default UserLiveSessionsSection;
