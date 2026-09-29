import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { SLPAvailability, LiveSession } from "../../types/supabase";
import {
  generateAvailableSlots,
  verifyActivePatientAssignment,
  checkForSessionConflict,
  TimeSlot,
  DAY_NAMES
} from "../../lib/liveSessionUtils";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Avatar } from "../Avatar";
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  X,
  AlertCircle,
  CheckCircle2,
  Send,
  Sparkles,
  Info
} from "lucide-react";

interface PatientOption {
  id: string; // Patient profile ID
  full_name: string;
  email: string;
  avatar_url?: string;
}

interface SLPBookSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedPatientId?: string | null;
  onSuccess?: () => void;
}

export function SLPBookSessionModal({
  isOpen,
  onClose,
  preselectedPatientId,
  onSuccess
}: SLPBookSessionModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clinician & Assigned Patients state
  const [slpInfo, setSlpInfo] = useState<{ id: string; full_name: string } | null>(null);
  const [assignedPatients, setAssignedPatients] = useState<PatientOption[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");

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

  // Initialize Clinician and Assigned Patients
  useEffect(() => {
    if (!isOpen || !profile?.id) return;

    async function initData() {
      try {
        setLoading(true);
        setError(null);

        // 1. Get current SLP record
        const { data: slpData, error: slpErr } = await (supabase.from("slps") as any)
          .select("id, full_name")
          .eq("user_id", profile.id)
          .single();

        if (slpErr || !slpData) {
          throw new Error("Clinician account not found.");
        }
        setSlpInfo(slpData);

        // 2. Fetch ACTIVE patient assignments for this SLP
        const { data: assignments, error: assignErr } = await (supabase.from(
          "patient_assignments"
        ) as any)
          .select(`
            patient_id,
            status,
            profiles:patient_id ( id, full_name, email, avatar_url )
          `)
          .eq("slp_id", slpData.id)
          .eq("status", "ACTIVE");

        if (assignErr) throw assignErr;

        const patientList: PatientOption[] = (assignments || [])
          .map((a: any) => a.profiles)
          .filter(Boolean);

        setAssignedPatients(patientList);

        if (preselectedPatientId && patientList.some((p) => p.id === preselectedPatientId)) {
          setSelectedPatientId(preselectedPatientId);
        } else if (patientList.length > 0) {
          setSelectedPatientId(patientList[0].id);
        } else {
          setSelectedPatientId("");
        }

        // 3. Fetch SLP's weekly availability records
        const { data: availData, error: availErr } = await (supabase.from(
          "slp_availability"
        ) as any)
          .select("*")
          .eq("slp_id", slpData.id);

        if (availErr) throw availErr;
        setAvailabilities(availData || []);
      } catch (err: any) {
        console.error("Error loading booking modal data:", err);
        setError(err.message || "Failed to initialize booking session.");
      } finally {
        setLoading(false);
      }
    }

    initData();
  }, [isOpen, profile?.id, preselectedPatientId]);

  // Load existing sessions for selected date to compute conflicts
  useEffect(() => {
    if (!isOpen || !slpInfo?.id || !selectedDate) return;

    async function loadDateSessions() {
      try {
        const startOfDay = `${selectedDate}T00:00:00.000Z`;
        const endOfDay = `${selectedDate}T23:59:59.999Z`;

        let query = (supabase.from("live_sessions") as any)
          .select("*")
          .gte("scheduled_start", startOfDay)
          .lte("scheduled_end", endOfDay);

        if (selectedPatientId && selectedPatientId.trim() !== "") {
          query = query.or(`slp_id.eq.${slpInfo.id},patient_id.eq.${selectedPatientId}`);
        } else {
          query = query.eq("slp_id", slpInfo.id);
        }

        const { data, error: sessErr } = await query;

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
  }, [isOpen, slpInfo?.id, selectedDate, selectedPatientId]);

  // Recalculate available slots whenever date, duration, availability or existing sessions change
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
    setSelectedSlot(null); // Reset selection when parameters change
  }, [selectedDate, duration, availabilities, existingSessions]);

  const handleSendBookingRequest = async () => {
    if (!slpInfo?.id) return;
    if (!selectedPatientId) {
      setError("Please select a patient.");
      return;
    }
    if (!selectedSlot) {
      setError("Please select an available time slot.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Step 1: Verify active patient assignment relationship
      const isActiveAssignment = await verifyActivePatientAssignment(
        slpInfo.id,
        selectedPatientId
      );

      if (!isActiveAssignment) {
        throw new Error("Cannot book session: Patient is not actively assigned to you.");
      }

      // Step 2: Double check for overlapping session conflict
      const conflictMsg = await checkForSessionConflict(
        slpInfo.id,
        selectedPatientId,
        selectedSlot.startISO,
        selectedSlot.endISO
      );

      if (conflictMsg) {
        throw new Error(conflictMsg);
      }

      // Step 3: Insert into live_sessions with status 'pending'
      const meetingId = `speakease-live-${Math.random().toString(36).substring(2, 10)}`;

      const { data: newSession, error: insertErr } = await (supabase.from(
        "live_sessions"
      ) as any)
        .insert({
          slp_id: slpInfo.id,
          patient_id: selectedPatientId,
          scheduled_start: selectedSlot.startISO,
          scheduled_end: selectedSlot.endISO,
          duration: duration,
          status: "pending",
          requested_by: "slp",
          purpose: purpose.trim() || null,
          meeting_id: meetingId
        })
        .select()
        .single();

      if (insertErr || !newSession) {
        throw new Error(insertErr?.message || "Failed to create live session booking.");
      }

      // Step 4: Insert notification for the patient using existing notifications architecture
      const selectedPatient = assignedPatients.find((p) => p.id === selectedPatientId);
      const formattedDateStr = new Date(selectedSlot.startISO).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
      });

      const notifMessage = `${slpInfo.full_name} requested a ${duration}-min live session for ${formattedDateStr} at ${selectedSlot.startTimeStr}.`;

      await (supabase.from("notifications") as any).insert({
        user_id: selectedPatientId,
        session_id: newSession.id,
        type: "live_session_request",
        title: "Live Session Request",
        message: notifMessage,
        is_read: false
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Booking failed:", err);
      setError(err.message || "Failed to send booking request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const todayStr = new Date().toISOString().split("T")[0];
  const selectedPatientObj = assignedPatients.find((p) => p.id === selectedPatientId);

  // Day of week display name for selected date
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
              <h2 className="text-lg font-bold text-slate-900">Book Live Session</h2>
              <p className="text-xs text-slate-500">Schedule an active video appointment with a patient</p>
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
          ) : assignedPatients.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-amber-50/60 border border-amber-200/60 space-y-2">
              <Info className="h-8 w-8 text-amber-600 mx-auto" />
              <p className="text-sm font-semibold text-amber-900">No Active Patients Found</p>
              <p className="text-xs text-amber-700">
                You can only schedule live sessions with patients who have an active patient-clinician assignment.
              </p>
            </div>
          ) : (
            <>
              {/* Patient Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Patient
                </label>
                {preselectedPatientId && selectedPatientObj ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <Avatar
                      src={selectedPatientObj.avatar_url}
                      name={selectedPatientObj.full_name}
                      size="sm"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {selectedPatientObj.full_name}
                      </span>
                      <span className="text-xs text-slate-500 truncate">
                        {selectedPatientObj.email}
                      </span>
                    </div>
                  </div>
                ) : (
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                  >
                    {assignedPatients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.email})
                      </option>
                    ))}
                  </select>
                )}
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
                    Available Time Slot
                  </label>
                  <span className="text-xs text-slate-400">
                    {availableSlots.length} slot{availableSlots.length === 1 ? "" : "s"} available
                  </span>
                </div>

                {availabilities.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500 space-y-1">
                    <p className="font-medium text-slate-700">No availability configured</p>
                    <p>Please configure your weekly working schedule in "My Availability" first.</p>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/60 text-center text-xs text-amber-800 space-y-1">
                    <p className="font-semibold text-amber-900">No available slots on {selectedDayName}</p>
                    <p>There are no unbooked slots or working hours set for this date.</p>
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
                  placeholder="e.g. Fluency evaluation, Weekly articulation check"
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
          <Button
            onClick={handleSendBookingRequest}
            disabled={submitting || !selectedSlot || !selectedPatientId}
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
                Send Booking Request
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
