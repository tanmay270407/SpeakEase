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
 * Convert Date object to local calendar date string "YYYY-MM-DD"
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
 * Calculate dynamic default custom appointment start time.
 * Adds 10 minutes to current local time and rounds up to the next full minute
 * if seconds/milliseconds are non-zero, ensuring at least 10 minutes of lead time.
 * Correctly accounts for midnight rollover by advancing the date.
 */
export function calculateDynamicDefaultCustomStartTime(baseDate: Date = new Date()): {
  dateStr: string; // "YYYY-MM-DD"
  time24Str: string; // "HH:mm" (24-hour format for <input type="time">)
  time12Str: string; // e.g. "12:54 PM"
  fullDate: Date;
  didCrossMidnight: boolean;
} {
  const now = new Date(baseDate);
  const hasSubMinute = now.getSeconds() > 0 || now.getMilliseconds() > 0;

  // Clone date and add 10 minutes
  const target = new Date(now.getTime() + 10 * 60 * 1000);

  if (hasSubMinute) {
    target.setSeconds(0, 0);
    target.setMinutes(target.getMinutes() + 1);
  } else {
    target.setSeconds(0, 0);
  }

  // Check if midnight was crossed relative to baseDate local day
  const didCrossMidnight =
    target.getFullYear() !== now.getFullYear() ||
    target.getMonth() !== now.getMonth() ||
    target.getDate() !== now.getDate();

  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  const hours = String(target.getHours()).padStart(2, "0");
  const minutes = String(target.getMinutes()).padStart(2, "0");
  const time24Str = `${hours}:${minutes}`;

  const time12Str = formatTime24to12(time24Str);

  return {
    dateStr,
    time24Str,
    time12Str,
    fullDate: target,
    didCrossMidnight,
  };
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
  existingSessions: LiveSession[],
  minLeadMinutes: number = 10
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

  // 2. Rule: Must satisfy minimum lead time (at least 10 minutes from now)
  // 45-second grace window to absorb minute-level precision in <input type="time">
  const minStartAllowed = new Date(now.getTime() + (minLeadMinutes * 60 - 45) * 1000);
  if (slotStart.getTime() < minStartAllowed.getTime()) {
    if (slotStart.getTime() <= now.getTime()) {
      return {
        isValid: false,
        error: "Selected time is in the past. Please select a future time."
      };
    }
    return {
      isValid: false,
      error: `Selected start time must be at least ${minLeadMinutes} minutes in the future.`
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

  // 1. Verify not in past and satisfies minimum 10-minute lead time
  const now = new Date();
  // 45-second grace window to absorb form filling, network and clock skew latency
  const minLeadTimeMs = (10 * 60 - 45) * 1000;
  if (start.getTime() < now.getTime() + minLeadTimeMs) {
    if (start.getTime() <= now.getTime()) {
      return "The requested session start time is in the past. Please select a future time.";
    }
    return "The requested session start time must be at least 10 minutes in the future.";
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
