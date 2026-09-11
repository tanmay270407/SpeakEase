import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { LiveSession, SLP } from "../../types/supabase";
import { Card, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Avatar } from "../Avatar";
import {
  Video,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Ban
} from "lucide-react";

interface ExtendedLiveSession extends LiveSession {
  slps?: SLP;
}

export function PatientLiveSessionsCard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<ExtendedLiveSession[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelModalSession, setCancelModalSession] = useState<ExtendedLiveSession | null>(null);

  const fetchPatientLiveSessions = async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      const { data, error } = await (supabase.from("live_sessions") as any)
        .select(`
          *,
          slps:slp_id ( id, user_id, full_name, professional_title, specialization, profile_image )
        `)
        .eq("patient_id", profile.id)
        .in("status", ["pending", "confirmed"])
        .order("scheduled_start", { ascending: true });

      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      console.error("Error fetching patient live sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatientLiveSessions();

    if (!profile?.id) return;

    // Supabase Realtime channel for live sessions updates
    const channel = supabase
      .channel("patient_live_sessions_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_sessions",
          filter: `patient_id=eq.${profile.id}`
        },
        () => {
          fetchPatientLiveSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const handleRespondSession = async (
    session: ExtendedLiveSession,
    newStatus: "confirmed" | "rejected"
  ) => {
    try {
      setActionLoading(session.id);

      // Update session status in DB
      const { error: updateErr } = await (supabase.from("live_sessions") as any)
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", session.id)
        .eq("patient_id", profile?.id); // Security: ensure only target patient can respond

      if (updateErr) throw updateErr;

      // Send in-app notification to SLP
      if (session.slps?.user_id) {
        const dateStr = new Date(session.scheduled_start).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric"
        });
        const timeStr = new Date(session.scheduled_start).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit"
        });

        const slpNotifTitle =
          newStatus === "confirmed" ? "Session Request Accepted" : "Session Request Declined";

        const slpNotifMsg =
          newStatus === "confirmed"
            ? `${profile?.full_name || "Patient"} accepted your live session request for ${dateStr} at ${timeStr}.`
            : `${profile?.full_name || "Patient"} declined your live session request for ${dateStr} at ${timeStr}.`;

        await (supabase.from("notifications") as any).insert({
          user_id: session.slps.user_id,
          session_id: session.id,
          type: newStatus === "confirmed" ? "live_session_accepted" : "live_session_rejected",
          title: slpNotifTitle,
          message: slpNotifMsg,
          is_read: false
        });
      }

      await fetchPatientLiveSessions();
    } catch (err: any) {
      console.error("Failed to respond to live session request:", err);
      alert(err.message || "Failed to update session request.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSession = async () => {
    if (!cancelModalSession || !profile?.id) return;
    try {
      setActionLoading(cancelModalSession.id);

      const { error: cancelErr } = await (supabase.from("live_sessions") as any)
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString()
        })
        .eq("id", cancelModalSession.id)
        .eq("patient_id", profile.id);

      if (cancelErr) throw cancelErr;

      // Notify SLP
      if (cancelModalSession.slps?.user_id) {
        const dateStr = new Date(cancelModalSession.scheduled_start).toLocaleDateString(
          "en-US",
          { weekday: "short", month: "short", day: "numeric" }
        );
        await (supabase.from("notifications") as any).insert({
          user_id: cancelModalSession.slps.user_id,
          session_id: cancelModalSession.id,
          type: "live_session_cancelled",
          title: "Live Session Cancelled",
          message: `${profile.full_name || "Patient"} cancelled the scheduled live session for ${dateStr}.`,
          is_read: false
        });
      }

      setCancelModalSession(null);
      await fetchPatientLiveSessions();
    } catch (err: any) {
      console.error("Failed to cancel live session:", err);
      alert(err.message || "Failed to cancel live session.");
    } finally {
      setActionLoading(null);
    }
  };

  const pendingRequests = sessions.filter((s) => s.status === "pending");
  const upcomingConfirmed = sessions.filter(
    (s) => s.status === "confirmed" && new Date(s.scheduled_end) > new Date()
  );

  if (loading && sessions.length === 0) {
    return null;
  }

  if (pendingRequests.length === 0 && upcomingConfirmed.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 my-6">
      {/* 1. Pending Live Session Requests */}
      {pendingRequests.map((session) => {
        const dateStr = new Date(session.scheduled_start).toLocaleDateString("en-US", {
          weekday: "long",
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

        const isBusy = actionLoading === session.id;

        return (
          <Card
            key={session.id}
            className="border-2 border-indigo-200 bg-linear-to-r from-indigo-50/80 via-white to-white shadow-xs overflow-hidden"
          >
            <CardContent className="p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-xs shrink-0 mt-0.5">
                    <Video className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-semibold text-xs border border-amber-200">
                        Live Session Request
                      </Badge>
                      <span className="text-xs text-slate-500 font-medium">
                        {session.duration} minutes
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {session.requested_by === "patient"
                        ? `Requested session with ${session.slps?.full_name || "Clinician"}`
                        : `${session.slps?.full_name || "Speech Pathologist"} requested a live session`}
                    </h3>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 font-medium pt-0.5">
                      <span className="flex items-center gap-1.5 text-slate-800">
                        <Calendar className="h-4 w-4 text-indigo-600" />
                        {dateStr}
                      </span>
                      <span className="flex items-center gap-1.5 text-slate-800">
                        <Clock className="h-4 w-4 text-indigo-600" />
                        {startTimeStr} – {endTimeStr}
                      </span>
                    </div>

                    {session.purpose && (
                      <p className="text-xs text-slate-600 italic pt-1">
                        "{session.purpose}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Accept / Decline Action Buttons */}
                <div className="flex items-center gap-2.5 shrink-0 pt-2 md:pt-0">
                  <Button
                    variant="outline"
                    onClick={() => handleRespondSession(session, "rejected")}
                    disabled={isBusy}
                    className="border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer text-xs h-9 px-4 font-semibold"
                  >
                    <XCircle className="h-4 w-4 mr-1.5 text-slate-400" />
                    Decline
                  </Button>
                  <Button
                    onClick={() => handleRespondSession(session, "confirmed")}
                    disabled={isBusy}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer text-xs h-9 px-4 font-semibold shadow-xs"
                  >
                    {isBusy ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Accept Session
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* 2. Upcoming Confirmed Live Sessions */}
      {upcomingConfirmed.map((session) => {
        const dateStr = new Date(session.scheduled_start).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric"
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
            className="border border-emerald-200 bg-emerald-50/40 shadow-2xs overflow-hidden"
          >
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <Avatar
                    src={session.slps?.profile_image}
                    name={session.slps?.full_name || "SLP"}
                    size="md"
                  />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-semibold text-xs border border-emerald-200">
                        Upcoming Live Session
                      </Badge>
                      <span className="text-xs font-semibold text-slate-500">
                        {session.duration} min
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900">
                      With {session.slps?.full_name || "Clinician"}
                    </h4>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-medium">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                        {dateStr}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-emerald-600" />
                        {startTimeStr} – {endTimeStr}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    onClick={() => setCancelModalSession(session)}
                    className="text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 h-8 px-2.5 cursor-pointer"
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    onClick={() =>
                      alert("Meeting Room ready. Video link activates at scheduled session time.")
                    }
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3.5 font-semibold cursor-pointer shadow-2xs"
                  >
                    <Video className="h-3.5 w-3.5 mr-1.5" />
                    Join Session
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Cancellation Modal */}
      {cancelModalSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Cancel Live Session?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to cancel your upcoming session with{" "}
              <strong className="text-slate-900">
                {cancelModalSession.slps?.full_name || "Clinician"}
              </strong>
              ? This action will inform your clinician.
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
                onClick={handleCancelSession}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PatientLiveSessionsCard;
