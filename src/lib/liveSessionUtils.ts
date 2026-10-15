import { supabase } from "./supabase";
import { SLPAvailability, LiveSession } from "../types/supabase";

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

export interface TimeSlot {
  startTimeStr: string; // e.g. "10:00 AM"
  endTimeStr: string;   // e.g. "10:30 AM"
  startISO: string;     // ISO 8601 string for DB
  endISO: string;       // ISO 8601 string for DB
}

/**
 * Format string "HH:MM:SS" or "HH:MM" into "hh:mm AM/PM"
 */
export function formatTime24to12(timeStr: string): string {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || "00";
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  return `${hours}:${minutes.padStart(2, "0")} ${ampm}`;
}

/**
 * Convert Date object to "HH:MM:SS"
 */
export function formatTimeFromDate(d: Date): string {
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  const secs = String(d.getSeconds()).padStart(2, "0");
  return `${hours}:${mins}:${secs}`;
}

/**
 * Generate discrete time slots from SLP weekly availability & existing booked sessions.
 */
export function generateAvailableSlots(
  dateStr: string, // "YYYY-MM-DD"
  durationMinutes: number, // 30, 45, 60
  availabilities: SLPAvailability[],
  existingSessions: LiveSession[]
): TimeSlot[] {
  if (!dateStr) return [];
  
  // Parse date safely in local time
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return [];

  const targetDate = new Date(year, month - 1, day);
  const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Filter active availabilities for target day of week
  const dayAvailabilities = availabilities.filter(
    (a) => a.day_of_week === dayOfWeek && a.is_available
  );

  if (dayAvailabilities.length === 0) return [];

  const now = new Date();
  const slots: TimeSlot[] = [];

  for (const avail of dayAvailabilities) {
    if (!avail.start_time || !avail.end_time) continue;

    const [startH, startM] = avail.start_time.split(":").map(Number);
    const [endH, endM] = avail.end_time.split(":").map(Number);

    const windowStart = new Date(year, month - 1, day, startH, startM, 0, 0);
    const windowEnd = new Date(year, month - 1, day, endH, endM, 0, 0);

    if (windowEnd <= windowStart) continue;

    // Slot increment interval (e.g. 15 or 30 mins)
    const stepMs = 30 * 60 * 1000;
    const durationMs = durationMinutes * 60 * 1000;

    let currentStartMs = windowStart.getTime();

    while (currentStartMs + durationMs <= windowEnd.getTime()) {
      const slotStart = new Date(currentStartMs);
      const slotEnd = new Date(currentStartMs + durationMs);

      // Rule 1: Slot must be in the future (at least 2 mins ahead of now)
      const minStartAllowed = new Date(now.getTime() + 2 * 60 * 1000);
      const isInFuture = slotStart >= minStartAllowed;

      if (isInFuture) {
        // Rule 2: No overlap with any existing pending/confirmed session for SLP or Patient
        const hasConflict = existingSessions.some((session) => {
          if (session.status === "cancelled" || session.status === "rejected") {
            return false;
          }
          const sessStart = new Date(session.scheduled_start).getTime();
          const sessEnd = new Date(session.scheduled_end).getTime();

          // Overlap check: slotStart < sessEnd AND slotEnd > sessStart
          return slotStart.getTime() < sessEnd && slotEnd.getTime() > sessStart;
        });

        if (!hasConflict) {
          slots.push({
            startTimeStr: formatTime24to12(formatTimeFromDate(slotStart)),
            endTimeStr: formatTime24to12(formatTimeFromDate(slotEnd)),
            startISO: slotStart.toISOString(),
            endISO: slotEnd.toISOString()
          });
        }
      }

      currentStartMs += stepMs;
    }
  }

  return slots;
}

/**
 * Create a TimeSlot object for a custom start time (e.g. "11:40") and duration
 */
export function createCustomTimeSlot(
  dateStr: string, // "YYYY-MM-DD"
  time24Str: string, // "11:40"
  durationMinutes: number // 30, 45, 60
): TimeSlot | null {
  if (!dateStr || !time24Str) return null;

  const [year, month, day] = dateStr.split("-").map(Number);
  const timeParts = time24Str.split(":").map(Number);
  if (timeParts.length < 2) return null;

  const hours = timeParts[0];
  const minutes = timeParts[1];

  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
    return null;
  }

  const slotStart = new Date(year, month - 1, day, hours, minutes, 0, 0);
  const durationMs = durationMinutes * 60 * 1000;
  const slotEnd = new Date(slotStart.getTime() + durationMs);

  return {
    startTimeStr: formatTime24to12(formatTimeFromDate(slotStart)),
    endTimeStr: formatTime24to12(formatTimeFromDate(slotEnd)),
    startISO: slotStart.toISOString(),
    endISO: slotEnd.toISOString()
  };
}

/**
 * Validate a custom time slot against SLP working hours, past time, and existing sessions.
 */
export function validateCustomTimeSlot(
  slot: TimeSlot | null,
  dateStr: string,
  availabilities: SLPAvailability[],
  existingSessions: LiveSession[]
): { isValid: boolean; error: string | null } {
  if (!slot || !dateStr) {
    return { isValid: false, error: "Please enter a valid start time." };
  }

  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) {
    return { isValid: false, error: "Invalid date selected." };
  }

  const targetDate = new Date(year, month - 1, day);
  const dayOfWeek = targetDate.getDay();

  // 1. Check if clinician has working hours on this day
  const dayAvailabilities = availabilities.filter(
    (a) => a.day_of_week === dayOfWeek && a.is_available
  );

  if (dayAvailabilities.length === 0) {
    return {
      isValid: false,
      error: `Clinician is not available on ${DAY_NAMES[dayOfWeek]}s.`
    };
  }

  const slotStart = new Date(slot.startISO);
  const slotEnd = new Date(slot.endISO);
  const now = new Date();

  // 2. Rule: Must be in future (at least 2 mins from now)
  const minStartAllowed = new Date(now.getTime() + 2 * 60 * 1000);
  if (slotStart < minStartAllowed) {
    return {
      isValid: false,
      error: "Selected time is in the past. Please select a future time."
    };
  }

  // 3. Rule: Slot must fall within clinician availability window(s)
  let fitsInWorkingHours = false;
  let formattedWorkingHours = "";

  for (const avail of dayAvailabilities) {
    if (!avail.start_time || !avail.end_time) continue;

    const [startH, startM] = avail.start_time.split(":").map(Number);
    const [endH, endM] = avail.end_time.split(":").map(Number);

    const windowStart = new Date(year, month - 1, day, startH, startM, 0, 0);
    const windowEnd = new Date(year, month - 1, day, endH, endM, 0, 0);

    const start12 = formatTime24to12(avail.start_time);
    const end12 = formatTime24to12(avail.end_time);
    formattedWorkingHours = formattedWorkingHours
      ? `${formattedWorkingHours}, ${start12} – ${end12}`
      : `${start12} – ${end12}`;

    if (slotStart.getTime() >= windowStart.getTime() && slotEnd.getTime() <= windowEnd.getTime()) {
      fitsInWorkingHours = true;
      break;
    }
  }

  if (!fitsInWorkingHours) {
    return {
      isValid: false,
      error: `Selected time (${slot.startTimeStr} – ${slot.endTimeStr}) is outside clinician working hours (${formattedWorkingHours}).`
    };
  }

  // 4. Rule: No overlap with existing pending/confirmed sessions
  const conflict = existingSessions.find((session) => {
    if (session.status === "cancelled" || session.status === "rejected") {
      return false;
    }
    const sessStart = new Date(session.scheduled_start).getTime();
    const sessEnd = new Date(session.scheduled_end).getTime();

    // Overlap check
    return slotStart.getTime() < sessEnd && slotEnd.getTime() > sessStart;
  });

  if (conflict) {
    return {
      isValid: false,
      error: "Selected custom time conflicts with an existing appointment or pending request."
    };
  }

  return { isValid: true, error: null };
}

/**
 * Fetch patient active connection check
 */
export async function verifyActivePatientAssignment(
  slpId: string,
  patientId: string
): Promise<boolean> {
  const { data, error } = await (supabase.from("patient_assignments") as any)
    .select("id")
    .eq("slp_id", slpId)
    .eq("patient_id", patientId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error || !data) return false;
  return true;
}

/**
 * Perform authoritative backend availability & conflict check before creating
 */
export async function checkForSessionConflict(
  slpId: string,
  patientId: string,
  startISO: string,
  endISO: string
): Promise<string | null> {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const startIsoStr = start.toISOString();
  const endIsoStr = end.toISOString();

  // 1. Verify not in past
  const now = new Date();
  if (start.getTime() < now.getTime() + 60 * 1000) {
    return "The requested session start time is in the past. Please select a future time.";
  }

  // 2. Authoritative Working Hours Check against slp_availability in database
  const dayOfWeek = start.getDay();
  const { data: availData, error: availErr } = await (supabase.from(
    "slp_availability"
  ) as any)
    .select("*")
    .eq("slp_id", slpId)
    .eq("day_of_week", dayOfWeek)
    .eq("is_available", true);

  if (availErr) {
    return "Failed to verify clinician working hours.";
  }

  if (!availData || availData.length === 0) {
    return `The clinician has no available working hours listed on ${DAY_NAMES[dayOfWeek]}s.`;
  }

  const year = start.getFullYear();
  const month = start.getMonth();
  const day = start.getDate();

  let isWithinWorkingHours = false;
  let availTimesFormatted = "";

  for (const avail of availData) {
    if (!avail.start_time || !avail.end_time) continue;
    const [sH, sM] = avail.start_time.split(":").map(Number);
    const [eH, eM] = avail.end_time.split(":").map(Number);

    const winStart = new Date(year, month, day, sH, sM, 0, 0);
    const winEnd = new Date(year, month, day, eH, eM, 0, 0);

    const s12 = formatTime24to12(avail.start_time);
    const e12 = formatTime24to12(avail.end_time);
    availTimesFormatted = availTimesFormatted ? `${availTimesFormatted}, ${s12} – ${e12}` : `${s12} – ${e12}`;

    if (start.getTime() >= winStart.getTime() && end.getTime() <= winEnd.getTime()) {
      isWithinWorkingHours = true;
      break;
    }
  }

  if (!isWithinWorkingHours) {
    return `The requested time falls outside clinician working hours for ${DAY_NAMES[dayOfWeek]} (${availTimesFormatted}).`;
  }

  // 3. Authoritative Overlapping Conflict Query for SLP
  const { data: slpSessions, error: slpErr } = await (supabase.from("live_sessions") as any)
    .select("id, scheduled_start, scheduled_end, status")
    .eq("slp_id", slpId)
    .in("status", ["pending", "confirmed"])
    .lt("scheduled_start", endIsoStr)
    .gt("scheduled_end", startIsoStr);

  if (slpErr) return "Failed to check clinician schedule conflict.";
  if (slpSessions && slpSessions.length > 0) {
    return "The clinician already has another live session scheduled or pending at this time.";
  }

  // 4. Authoritative Overlapping Conflict Query for Patient
  const { data: patientSessions, error: patErr } = await (supabase.from("live_sessions") as any)
    .select("id, scheduled_start, scheduled_end, status")
    .eq("patient_id", patientId)
    .in("status", ["pending", "confirmed"])
    .lt("scheduled_start", endIsoStr)
    .gt("scheduled_end", startIsoStr);

  if (patErr) return "Failed to check patient schedule conflict.";
  if (patientSessions && patientSessions.length > 0) {
    return "You already have another live session scheduled or pending at this time.";
  }

  return null;
}
