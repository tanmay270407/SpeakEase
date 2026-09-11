import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { SLPAvailability, LiveSession } from "../../types/supabase";
import { connectionService } from "../../services/connectionService";
import {
  generateAvailableSlots,
  verifyActivePatientAssignment,
  checkForSessionConflict,
  TimeSlot,
  DAY_NAMES
} from "../../lib/liveSessionUtils";
import { Button } from "../ui/Button";
import { Avatar } from "../Avatar";
import { Link } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  X,
  AlertCircle,
  CheckCircle2,
  Send,
  Info,
  Search,
  Stethoscope
} from "lucide-react";

interface PatientBookSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PatientBookSessionModal({
  isOpen,
  onClose,
  onSuccess
}: PatientBookSessionModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active SLP state
  const [activeAssignment, setActiveAssignment] = useState<any | null>(null);
  const [slpInfo, setSlpInfo] = useState<any | null>(null);

  // Booking details state
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to tomorrow YYYY-MM-DD
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return tom.toISOString().split("T")[0];
  });
  const [duration, setDuration] = useState<number>(30);
  const [purpose, setPurpose] = useState<string>("");

  // Availability & Slots state
  const [availabilities, setAvailabilities] = useState<SLPAvailability[]>([]);
  const [existingSessions, setExistingSessions] = useState<LiveSession[]>([]);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // 1. Fetch active assigned SLP & Availability
  useEffect(() => {
    if (!isOpen || !profile?.id) return;

    async function initData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch active assignment for current patient
        const assignment = await connectionService.getPatientActiveSLP(profile.id);
        setActiveAssignment(assignment);

        if (!assignment || !assignment.slps) {
          setSlpInfo(null);
          return;
        }

        const slp = assignment.slps;
        setSlpInfo(slp);

        // Fetch SLP's weekly availability records
        const { data: availData, error: availErr } = await (supabase.from(
          "slp_availability"
        ) as any)
          .select("*")
          .eq("slp_id", slp.id);

        if (availErr) throw availErr;
        setAvailabilities(availData || []);
      } catch (err: any) {
        console.error("Error initializing patient booking modal:", err);
        setError(err.message || "Failed to load clinician availability.");
      } finally {
        setLoading(false);
      }
    }

    initData();
  }, [isOpen, profile?.id]);

  // 2. Fetch existing sessions for selected date to prevent conflicts
  useEffect(() => {
    if (!isOpen || !slpInfo?.id || !selectedDate || !profile?.id) return;

    async function loadDateSessions() {
      try {
        const startOfDay = `${selectedDate}T00:00:00.000Z`;
        const endOfDay = `${selectedDate}T23:59:59.999Z`;

        const { data, error: sessErr } = await (supabase.from("live_sessions") as any)
          .select("*")
          .or(`slp_id.eq.${slpInfo.id},patient_id.eq.${profile.id}`)
          .gte("scheduled_start", startOfDay)
          .lte("scheduled_end", endOfDay);

        if (sessErr) {
          console.error("Error fetching sessions for date:", sessErr);
        } else {
          setExistingSessions(data || []);
        }
      } catch (err) {
        console.error("Error checking date sessions:", err);
      }
    }

    loadDateSessions();
  }, [isOpen, slpInfo?.id, selectedDate, profile?.id]);

  // 3. Recalculate available slots
  useEffect(() => {
    if (!selectedDate || availabilities.length === 0) {
      setAvailableSlots([]);
      setSelectedSlot(null);
      return;
    }

    const slots = generateAvailableSlots(
      selectedDate,
      duration,
      availabilities,
      existingSessions
    );

    setAvailableSlots(slots);
    setSelectedSlot(null);
  }, [selectedDate, duration, availabilities, existingSessions]);

  const handleSendBookingRequest = async () => {
    if (!profile?.id) return;
    if (!slpInfo?.id) {
      setError("No active Speech-Language Pathologist connected.");
      return;
    }
    if (!selectedSlot) {
      setError("Please select an available time slot.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Step 1: Verify active assignment authorization
      const isActiveAssignment = await verifyActivePatientAssignment(
        slpInfo.id,
        profile.id
      );

      if (!isActiveAssignment) {
        throw new Error("Cannot book session: You do not have an active care relationship with this SLP.");
      }

      // Step 2: Check for session conflict
      const conflictMsg = await checkForSessionConflict(
        slpInfo.id,
        profile.id,
        selectedSlot.startISO,
        selectedSlot.endISO
      );

      if (conflictMsg) {
        throw new Error(conflictMsg);
      }

      // Step 3: Insert into live_sessions (status: 'pending', requested_by: 'patient')
      const meetingId = `speakease-live-${Math.random().toString(36).substring(2, 10)}`;

      const { data: newSession, error: insertErr } = await (supabase.from(
        "live_sessions"
      ) as any)
        .insert({
          slp_id: slpInfo.id,
          patient_id: profile.id,
          scheduled_start: selectedSlot.startISO,
          scheduled_end: selectedSlot.endISO,
          duration: duration,
          status: "pending",
          requested_by: "patient",
          purpose: purpose.trim() || null,
          meeting_id: meetingId
        })
        .select()
        .single();

      if (insertErr || !newSession) {
        throw new Error(insertErr?.message || "Failed to create session booking request.");
      }

      // Step 4: Notify SLP
      if (slpInfo.user_id) {
        const formattedDateStr = new Date(selectedSlot.startISO).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric"
        });

        const notifMessage = `${profile.full_name || "Patient"} requested a ${duration}-min live session for ${formattedDateStr} at ${selectedSlot.startTimeStr}.`;

        await (supabase.from("notifications") as any).insert({
          user_id: slpInfo.user_id,
          session_id: newSession.id,
          type: "live_session_request",
          title: "Live Session Request",
          message: notifMessage,
          is_read: false
        });
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Patient booking request failed:", err);
      setError(err.message || "Failed to send live session request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const todayStr = new Date().toISOString().split("T")[0];
  const selectedDayName = selectedDate
    ? DAY_NAMES[new Date(selectedDate + "T00:00:00").getDay()]
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Request Live Session</h2>
              <p className="text-xs text-slate-500">Book an appointment with your Speech-Language Pathologist</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-600 border-t-transparent" />
            </div>
          ) : !slpInfo ? (
            <div className="p-8 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200 space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto">
                <Stethoscope className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">No Active SLP Connected</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  You can only request live appointments with your assigned clinician. Connect with a Speech-Language Pathologist to start booking.
                </p>
              </div>
              <div className="pt-2">
                <Link to="/find-slps" onClick={onClose}>
                  <Button className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4 font-semibold">
                    <Search className="h-3.5 w-3.5 mr-1.5" />
                    Find an SLP
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Clinician Card */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Target Clinician
                </label>
                <div className="flex items-center gap-3.5 p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/40">
                  <Avatar
                    src={slpInfo.profile_image}
                    name={slpInfo.full_name}
                    size="md"
                  />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {slpInfo.full_name}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                        Active Care Connection
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 truncate mt-0.5">
                      {slpInfo.professional_title || "Speech-Language Pathologist"} · {slpInfo.specialization || "Clinical Care"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Date & Duration Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Date Picker */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Date ({selectedDayName})
                  </label>
                  <input
                    type="date"
                    min={todayStr}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* Duration Picker */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Duration
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
                    {[30, 45, 60].map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setDuration(dur)}
                        className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                          duration === dur
                            ? "bg-white text-indigo-700 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {dur} min
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Available Time Slots */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    SLP Available Time Slot
                  </label>
                  <span className="text-xs text-slate-400 font-medium">
                    {availableSlots.length} slot{availableSlots.length === 1 ? "" : "s"} open
                  </span>
                </div>

                {availabilities.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500 space-y-1">
                    <p className="font-medium text-slate-700">No working hours listed</p>
                    <p>Your clinician has not set active availability for this schedule yet.</p>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/60 text-center text-xs text-amber-800 space-y-1">
                    <p className="font-semibold text-amber-900">No available slots on {selectedDayName}</p>
                    <p>All working hours on this date are either occupied or outside clinician schedule.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 border rounded-xl border-slate-200 bg-slate-50/50">
                    {availableSlots.map((slot) => {
                      const isSelected = selectedSlot?.startISO === slot.startISO;
                      return (
                        <button
                          key={slot.startISO}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-center ${
                            isSelected
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                              : "bg-white text-slate-800 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30"
                          }`}
                        >
                          {slot.startTimeStr} – {slot.endTimeStr}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Purpose / Note */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Purpose / Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Discuss progress, review exercise feedback"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  maxLength={120}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          {slpInfo && (
            <Button
              onClick={handleSendBookingRequest}
              disabled={submitting || !selectedSlot}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending Request...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Send Live Session Request
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PatientBookSessionModal;
