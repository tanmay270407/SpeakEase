import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { SLPAvailability } from "../../types/supabase";
import { DAY_NAMES, formatTime24to12 } from "../../lib/liveSessionUtils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Clock, CheckCircle2, AlertCircle, Save, Calendar, Sparkles } from "lucide-react";

interface DayConfig {
  dayOfWeek: number; // 0=Sunday, 1=Monday... 6=Saturday
  name: string;
  isAvailable: boolean;
  startTime: string; // "10:00:00"
  endTime: string;   // "17:00:00"
  slotDuration: number; // 30, 45, 60
  dbId?: string;
}

const DEFAULT_TIME_OPTIONS = [
  "07:00:00", "08:00:00", "09:00:00", "10:00:00", "11:00:00", "12:00:00",
  "13:00:00", "14:00:00", "15:00:00", "16:00:00", "17:00:00", "18:00:00",
  "19:00:00", "20:00:00"
];

// Order days starting with Monday (1) through Sunday (0)
const ORDERED_DAYS = [1, 2, 3, 4, 5, 6, 0];

export function SLPAvailabilityManager() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [slpId, setSlpId] = useState<string | null>(null);

  const [days, setDays] = useState<DayConfig[]>(() =>
    ORDERED_DAYS.map((d) => ({
      dayOfWeek: d,
      name: DAY_NAMES[d],
      isAvailable: d >= 1 && d <= 5, // Default Mon-Fri available
      startTime: "09:00:00",
      endTime: "17:00:00",
      slotDuration: 30
    }))
  );

  useEffect(() => {
    async function fetchAvailability() {
      if (!profile?.id) return;
      try {
        setLoading(true);
        setError(null);

        // Fetch current SLP ID
        const { data: slpData, error: slpErr } = await (supabase.from("slps") as any)
          .select("id")
          .eq("user_id", profile.id)
          .single();

        if (slpErr || !slpData) {
          throw new Error("SLP record not found.");
        }

        setSlpId(slpData.id);

        // Fetch existing availability records for this SLP
        const { data: availRecords, error: availErr } = await (supabase.from("slp_availability") as any)
          .select("*")
          .eq("slp_id", slpData.id);

        if (availErr) throw availErr;

        if (availRecords && availRecords.length > 0) {
          // Map DB records onto ordered days
          setDays(
            ORDERED_DAYS.map((dayNum) => {
              const record = availRecords.find(
                (r: SLPAvailability) => r.day_of_week === dayNum
              );
              if (record) {
                return {
                  dayOfWeek: dayNum,
                  name: DAY_NAMES[dayNum],
                  isAvailable: record.is_available,
                  startTime: record.start_time || "09:00:00",
                  endTime: record.end_time || "17:00:00",
                  slotDuration: record.slot_duration || 30,
                  dbId: record.id
                };
              }
              return {
                dayOfWeek: dayNum,
                name: DAY_NAMES[dayNum],
                isAvailable: false,
                startTime: "09:00:00",
                endTime: "17:00:00",
                slotDuration: 30
              };
            })
          );
        }
      } catch (err: any) {
        console.error("Error loading SLP availability:", err);
        setError(err.message || "Failed to load availability schedule.");
      } finally {
        setLoading(false);
      }
    }

    fetchAvailability();
  }, [profile?.id]);

  const handleToggleDay = (dayNum: number) => {
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayNum ? { ...d, isAvailable: !d.isAvailable } : d
      )
    );
  };

  const handleChangeTime = (
    dayNum: number,
    field: "startTime" | "endTime" | "slotDuration",
    val: string | number
  ) => {
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayNum ? { ...d, [field]: val } : d
      )
    );
  };

  const handleSaveSchedule = async () => {
    if (!slpId) return;
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      // Validate start/end times
      for (const d of days) {
        if (d.isAvailable) {
          if (d.startTime >= d.endTime) {
            throw new Error(`On ${d.name}, start time must be earlier than end time.`);
          }
        }
      }

      // Upsert records into slp_availability
      const rowsToUpsert = days.map((d) => ({
        ...(d.dbId ? { id: d.dbId } : {}),
        slp_id: slpId,
        day_of_week: d.dayOfWeek,
        start_time: d.startTime,
        end_time: d.endTime,
        is_available: d.isAvailable,
        slot_duration: d.slotDuration,
        updated_at: new Date().toISOString()
      }));

      const { data, error: upsertErr } = await (supabase.from("slp_availability") as any)
        .upsert(rowsToUpsert, { onConflict: "slp_id, day_of_week" })
        .select();

      if (upsertErr) {
        // Fallback: If conflict constraint isn't unique, delete and insert
        const { error: delErr } = await (supabase.from("slp_availability") as any)
          .delete()
          .eq("slp_id", slpId);

        if (delErr) throw upsertErr;

        const { data: inserted, error: insErr } = await (supabase.from("slp_availability") as any)
          .insert(rowsToUpsert.map(({ id, ...rest }) => rest))
          .select();

        if (insErr) throw insErr;
        
        // Update local IDs
        if (inserted) {
          setDays((prev) =>
            prev.map((dayObj) => {
              const matched = inserted.find((i: any) => i.day_of_week === dayObj.dayOfWeek);
              return matched ? { ...dayObj, dbId: matched.id } : dayObj;
            })
          );
        }
      } else if (data) {
        setDays((prev) =>
          prev.map((dayObj) => {
            const matched = data.find((i: any) => i.day_of_week === dayObj.dayOfWeek);
            return matched ? { ...dayObj, dbId: matched.id } : dayObj;
          })
        );
      }

      setSuccessMsg("Weekly availability schedule saved successfully!");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error("Failed to save schedule:", err);
      setError(err.message || "Failed to save availability schedule.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <Card className="border border-slate-200 bg-white shadow-xs">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-600" />
              My Availability Schedule
            </CardTitle>
            <CardDescription className="text-sm text-slate-500 mt-1">
              Configure your weekly working hours. Patient live session booking slots will be generated exclusively from these active times.
            </CardDescription>
          </div>
          <Button
            onClick={handleSaveSchedule}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 cursor-pointer shadow-xs"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </span>
            ) : (
              <span className="flex items-center gap-2 font-medium">
                <Save className="h-4 w-4" />
                Save Schedule
              </span>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 p-3.5 text-sm text-red-700 border border-red-200 flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="rounded-lg bg-emerald-50 p-3.5 text-sm text-emerald-800 border border-emerald-200 flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}

        <div className="divide-y divide-slate-100 border rounded-xl border-slate-200 bg-white overflow-hidden">
          {days.map((day) => (
            <div
              key={day.dayOfWeek}
              className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                day.isAvailable ? "bg-white" : "bg-slate-50/70 opacity-75"
              }`}
            >
              {/* Day Toggle */}
              <div className="flex items-center gap-3.5 w-44 shrink-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={day.isAvailable}
                  onClick={() => handleToggleDay(day.dayOfWeek)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    day.isAvailable ? "bg-indigo-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                      day.isAvailable ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-900">{day.name}</span>
                  <span className="text-xs font-medium text-slate-500">
                    {day.isAvailable ? (
                      <span className="text-emerald-700 font-medium">Active</span>
                    ) : (
                      "Unavailable"
                    )}
                  </span>
                </div>
              </div>

              {/* Time Configuration Controls */}
              {day.isAvailable ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">From:</span>
                    <select
                      value={day.startTime}
                      onChange={(e) =>
                        handleChangeTime(day.dayOfWeek, "startTime", e.target.value)
                      }
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                    >
                      {DEFAULT_TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {formatTime24to12(t)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-slate-400 font-medium text-xs">to</span>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">To:</span>
                    <select
                      value={day.endTime}
                      onChange={(e) =>
                        handleChangeTime(day.dayOfWeek, "endTime", e.target.value)
                      }
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                    >
                      {DEFAULT_TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {formatTime24to12(t)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 md:ml-4">
                    <span className="text-xs text-slate-500 font-medium">Default Slot:</span>
                    <select
                      value={day.slotDuration}
                      onChange={(e) =>
                        handleChangeTime(
                          day.dayOfWeek,
                          "slotDuration",
                          parseInt(e.target.value, 10)
                        )
                      }
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                    >
                      <option value={30}>30 mins</option>
                      <option value={45}>45 mins</option>
                      <option value={60}>60 mins</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">No bookings allowed on {day.name}s</div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
