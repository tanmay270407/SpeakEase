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
 * Check if session has overlapping conflict in DB before creating
 */
export async function checkForSessionConflict(
  slpId: string,
  patientId: string,
  startISO: string,
  endISO: string
): Promise<string | null> {
  const start = new Date(startISO).toISOString();
  const end = new Date(endISO).toISOString();

  // Query sessions for this SLP or Patient overlapping this time window
  const { data: slpSessions, error: slpErr } = await (supabase.from("live_sessions") as any)
    .select("id, scheduled_start, scheduled_end, status")
    .eq("slp_id", slpId)
    .in("status", ["pending", "confirmed"])
    .lt("scheduled_start", end)
    .gt("scheduled_end", start);

  if (slpErr) return "Failed to check clinician schedule conflict.";
  if (slpSessions && slpSessions.length > 0) {
    return "You already have another live session scheduled or pending at this time.";
  }

  const { data: patientSessions, error: patErr } = await (supabase.from("live_sessions") as any)
    .select("id, scheduled_start, scheduled_end, status")
    .eq("patient_id", patientId)
    .in("status", ["pending", "confirmed"])
    .lt("scheduled_start", end)
    .gt("scheduled_end", start);

  if (patErr) return "Failed to check patient schedule conflict.";
  if (patientSessions && patientSessions.length > 0) {
    return "The selected patient already has another session scheduled or pending at this time.";
  }

  return null;
}
