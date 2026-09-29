import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { LiveSession, Profile } from "../../types/supabase";
import { SLPBookSessionModal } from "./SLPBookSessionModal";
import { LiveVideoCallModal } from "../live/LiveVideoCallModal";
import { Card, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Avatar } from "../Avatar";
import {
  Video,
  Calendar,
  Clock,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Ban,
  User,
  Sparkles,
  RefreshCw,
  Search
} from "lucide-react";

interface ExtendedLiveSession extends LiveSession {
  profiles?: Profile;
  patient?: Profile;
}

export function SLPLiveSessionsTab() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [slpId, setSlpId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ExtendedLiveSession[]>([]);
  const [subTab, setSubTab] = useState<"upcoming" | "requests" | "history">("upcoming");
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [cancellingSessionId, setCancellingSessionId] = useState<string | null>(null);
  const [cancelTargetSession, setCancelTargetSession] = useState<ExtendedLiveSession | null>(null);
  const [activeCallSession, setActiveCallSession] = useState<ExtendedLiveSession | null>(null);

  const fetchLiveSessions = async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);

      // 1. Fetch SLP record ID
      const { data: slpData, error: slpErr } = await (supabase.from("slps") as any)
        .select("id")
        .eq("user_id", profile.id)
        .single();

      if (slpErr || !slpData) return;
      setSlpId(slpData.id);

      // 2. Fetch live sessions for this SLP
      const { data: sessionData, error: sessErr } = await (supabase.from(
        "live_sessions"
      ) as any)
        .select(`
          *,
          profiles:patient_id ( id, full_name, email, avatar_url )
        `)
        .eq("slp_id", slpData.id)
        .order("scheduled_start", { ascending: true });

      if (sessErr) throw sessErr;

      setSessions(sessionData || []);
    } catch (err) {
      console.error("Error fetching SLP live sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveSessions();

    if (!profile?.id) return;

    // Realtime channel subscription
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
          fetchLiveSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const handleConfirmCancel = async () => {
    if (!cancelTargetSession) return;
    try {
      setCancellingSessionId(cancelTargetSession.id);

      const { error: cancelErr } = await (supabase.from("live_sessions") as any)
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString()
        })
        .eq("id", cancelTargetSession.id);

      if (cancelErr) throw cancelErr;

      // Notify patient
      const dateStr = new Date(cancelTargetSession.scheduled_start).toLocaleDateString(
        "en-US",
        { weekday: "short", month: "short", day: "numeric" }
      );

      await (supabase.from("notifications") as any).insert({
        user_id: cancelTargetSession.patient_id,
        session_id: cancelTargetSession.id,
        type: "live_session_cancelled",
        title: "Live Session Cancelled",
        message: `Your clinician cancelled the scheduled live session for ${dateStr}.`,
        is_read: false
      });

      setCancelTargetSession(null);
      await fetchLiveSessions();
    } catch (err: any) {
      console.error("Failed to cancel live session:", err);
      alert(err.message || "Failed to cancel live session.");
    } finally {
      setCancellingSessionId(null);
    }
  };

  const now = new Date();

  const upcomingSessions = sessions.filter(
    (s) => s.status === "confirmed" && new Date(s.scheduled_end) > now
  );

  const pendingRequests = sessions.filter((s) => s.status === "pending");

  const historySessions = sessions.filter(
    (s) =>
      s.status === "completed" ||
      s.status === "rejected" ||
      s.status === "cancelled" ||
      (s.status === "confirmed" && new Date(s.scheduled_end) <= now)
  );

  const displayedSessions =
    subTab === "upcoming"
      ? upcomingSessions
      : subTab === "requests"
      ? pendingRequests
      : historySessions;

  return (
    <div className="space-y-6">
      {/* Top Banner Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 text-white shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">Live Video Telehealth Sessions</h3>
          </div>
          <p className="text-xs text-slate-300">
            Schedule and conduct real-time video consultations with actively connected patients.
          </p>
        </div>
        <Button
          onClick={() => setIsBookModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-xs cursor-pointer text-xs h-10 px-4 shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Book Live Session
        </Button>
      </div>

      {/* Sub-tabs filter */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
          <button
            onClick={() => setSubTab("upcoming")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
              subTab === "upcoming"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Upcoming Sessions</span>
            {upcomingSessions.length > 0 && (
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px] px-1.5 py-0">
                {upcomingSessions.length}
              </Badge>
            )}
          </button>

          <button
            onClick={() => setSubTab("requests")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
              subTab === "requests"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Pending Requests</span>
            {pendingRequests.length > 0 && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] px-1.5 py-0">
                {pendingRequests.length}
              </Badge>
            )}
          </button>

          <button
            onClick={() => setSubTab("history")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === "history"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Past & History ({historySessions.length})
          </button>
        </div>

        <button
          onClick={fetchLiveSessions}
          title="Refresh list"
          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Content List */}
      {loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : displayedSessions.length === 0 ? (
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-8 text-center space-y-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl w-fit mx-auto border border-indigo-100">
              <Calendar className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">
              {subTab === "upcoming"
                ? "No Upcoming Confirmed Sessions"
                : subTab === "requests"
                ? "No Pending Booking Requests"
                : "No Past Session Records"}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {subTab === "upcoming"
                ? "Schedule a live video appointment with an actively connected patient using the button above."
                : subTab === "requests"
                ? "When you send live session requests to patients, they will appear here awaiting patient confirmation."
                : "Historical completed, declined, and cancelled live sessions will appear here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayedSessions.map((session) => {
            const dateStr = new Date(session.scheduled_start).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric"
            });
            const startTimeStr = new Date(session.scheduled_start).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit"
            });
            const endTimeStr = new Date(session.scheduled_end).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit"
            });

            return (
              <Card
                key={session.id}
                className="border border-slate-200 bg-white shadow-2xs hover:border-slate-300 transition-all overflow-hidden"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <Avatar
                        src={session.profiles?.avatar_url}
                        name={session.profiles?.full_name || "Patient"}
                        size="md"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {session.status === "confirmed" && (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-semibold text-xs border border-emerald-200">
                              Confirmed
                            </Badge>
                          )}
                          {session.status === "pending" && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-semibold text-xs border border-amber-200">
                              Awaiting Patient Approval
                            </Badge>
                          )}
                          {session.status === "rejected" && (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100 font-semibold text-xs border border-red-200">
                              Declined by Patient
                            </Badge>
                          )}
                          {session.status === "cancelled" && (
                            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 font-semibold text-xs border border-slate-200">
                              Cancelled
                            </Badge>
                          )}
                          <span className="text-xs text-slate-500 font-medium">
                            {session.duration} min duration
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-slate-900">
                          Patient: {session.profiles?.full_name || "Assigned Patient"}
                        </h4>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 font-medium">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                            {dateStr}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-indigo-600" />
                            {startTimeStr} – {endTimeStr}
                          </span>
                        </div>

                        {session.purpose && (
                          <p className="text-xs text-slate-500 italic pt-0.5">
                            Purpose: "{session.purpose}"
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action controls */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0">
                      {(session.status === "confirmed" || session.status === "pending") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCancelTargetSession(session)}
                          className="text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 h-8 px-2.5 cursor-pointer"
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          Cancel
                        </Button>
                      )}

                      {session.status === "confirmed" && (
                        <Button
                          onClick={() => setActiveCallSession(session)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3.5 font-semibold cursor-pointer shadow-2xs"
                        >
                          <Video className="h-3.5 w-3.5 mr-1.5" />
                          Start Live Call
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Book Live Session Modal */}
      <SLPBookSessionModal
        isOpen={isBookModalOpen}
        onClose={() => setIsBookModalOpen(false)}
        onSuccess={() => {
          fetchLiveSessions();
        }}
      />

      {/* Live Video Call Room Modal */}
      {activeCallSession && (
        <LiveVideoCallModal
          isOpen={!!activeCallSession}
          session={{
            ...activeCallSession,
            patient: activeCallSession.patient || activeCallSession.profiles
          }}
          onClose={() => {
            setActiveCallSession(null);
            fetchLiveSessions();
          }}
          userRole="slp"
        />
      )}

      {/* Cancel Confirmation Modal */}
      {cancelTargetSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Cancel Live Session?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to cancel the live session with{" "}
              <strong className="text-slate-900">
                {cancelTargetSession.profiles?.full_name || "Patient"}
              </strong>
              ? A cancellation notification will be sent to the patient.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelTargetSession(null)}
              >
                Keep Session
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmCancel}
                disabled={cancellingSessionId === cancelTargetSession.id}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {cancellingSessionId === cancelTargetSession.id ? "Cancelling..." : "Confirm Cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
