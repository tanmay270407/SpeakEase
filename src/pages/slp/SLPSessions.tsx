import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/Avatar";
import { AudioPlayer } from "../../components/AudioPlayer";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { 
  Clock, 
  Activity, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  BrainCircuit, 
  MessageSquare, 
  X, 
  ChevronRight, 
  ExternalLink, 
  Sparkles,
  Layers,
  Calendar,
  User,
  Volume2,
  Video
} from "lucide-react";
import { formatDuration } from "../../lib/utils";
import { TableRowSkeleton } from "../../components/ui/Skeleton";
import { getExerciseDetailsById } from "../../data/exerciseDetailsData";
import { PracticeLevelMeter } from "../../components/PracticeLevelMeter";
import { SLPLiveSessionsTab } from "../../components/slp/SLPLiveSessionsTab";
import { SLPAvailabilityManager } from "../../components/slp/SLPAvailabilityManager";

interface PatientInfo {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
}

interface SessionRecord {
  id: string;
  user_id: string;
  exercise_id: string | null;
  duration: number;
  review_status: string;
  created_at: string;
  profiles?: PatientInfo;
  exercises?: { name: string } | null;
  speech_metrics?: {
    repetitions: number;
    pauses: number;
    prolongations: number;
    speech_rate: number | string;
  } | null;
}

export function SLPSessions() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Top mode tab: "live_sessions" | "practice_logs" | "availability"
  const initialTabParam = searchParams.get("tab");
  const [topTab, setTopTab] = useState<"live_sessions" | "practice_logs" | "availability">(
    initialTabParam === "availability"
      ? "availability"
      : initialTabParam === "practice"
      ? "practice_logs"
      : "live_sessions"
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activePatients, setActivePatients] = useState<PatientInfo[]>([]);
  const [slpId, setSlpId] = useState<string | null>(null);

  // Selected session for detailed view
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    searchParams.get("sessionId") || null
  );
  const [sessionDetail, setSessionDetail] = useState<{
    metrics: any;
    observation: any;
    clinicianNote: any;
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // Note editing state
  const [clinicalNoteInput, setClinicalNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Filters and sorting
  const [statusFilter, setStatusFilter] = useState<"ALL" | "NEEDS_REVIEW" | "REVIEWED">("ALL");
  const [patientFilter, setPatientFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PRACTICE" | "EXERCISE">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "duration_desc" | "duration_asc">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Load all sessions for authorized patients
  useEffect(() => {
    async function loadAuthorizedSessions() {
      if (!profile?.id) return;
      try {
        setLoading(true);
        setError(null);

        // 1. Get current SLP record
        const { data: slpData, error: slpErr } = await (supabase.from('slps') as any)
          .select('id')
          .eq('user_id', profile.id)
          .single();

        if (slpErr || !slpData) {
          throw new Error("Clinician profile not found.");
        }
        setSlpId(slpData.id);

        // 2. Fetch actively assigned patients for this SLP
        const { data: assignments, error: assignErr } = await (supabase.from('patient_assignments') as any)
          .select(`
            patient_id,
            status,
            profiles:patient_id ( id, full_name, email, avatar_url )
          `)
          .eq('slp_id', slpData.id)
          .eq('status', 'ACTIVE');

        if (assignErr) throw assignErr;

        const assignedPatients: PatientInfo[] = (assignments || [])
          .map((a: any) => a.profiles)
          .filter(Boolean);
        setActivePatients(assignedPatients);

        const patientIds = assignedPatients.map(p => p.id);

        if (patientIds.length === 0) {
          setSessions([]);
          setLoading(false);
          return;
        }

        // 3. Fetch sessions for ALL actively connected patients
        const { data: sessionData, error: sessErr } = await (supabase.from('sessions') as any)
          .select(`
            id,
            user_id,
            exercise_id,
            duration,
            review_status,
            created_at,
            profiles:user_id ( id, full_name, email, avatar_url ),
            exercises:exercise_id ( name ),
            speech_metrics ( repetitions, pauses, prolongations, speech_rate )
          `)
          .in('user_id', patientIds)
          .order('created_at', { ascending: false });

        if (sessErr) throw sessErr;

        const formattedSessions: SessionRecord[] = (sessionData || []).map((s: any) => ({
          ...s,
          speech_metrics: Array.isArray(s.speech_metrics) ? s.speech_metrics[0] : s.speech_metrics,
        }));

        setSessions(formattedSessions);

      } catch (err: any) {
        console.error("Error loading SLP sessions:", err);
        setError(err.message || "Failed to load patient sessions.");
      } finally {
        setLoading(false);
      }
    }

    loadAuthorizedSessions();

    // Subscribe to realtime updates for live sync
    const channel = supabase
      .channel('slp_sessions_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        loadAuthorizedSessions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clinician_notes' }, () => {
        loadAuthorizedSessions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_assignments' }, () => {
        loadAuthorizedSessions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Load session detail when selectedSessionId changes
  useEffect(() => {
    async function loadDetail() {
      if (!selectedSessionId) {
        setSessionDetail(null);
        return;
      }

      try {
        setLoadingDetail(true);
        setSaveSuccessMsg(null);

        // Fetch speech metrics
        const { data: mData } = await (supabase.from('speech_metrics') as any)
          .select('*')
          .eq('session_id', selectedSessionId)
          .maybeSingle();

        // Fetch AI observations
        const { data: oData } = await (supabase.from('ai_observations') as any)
          .select('*')
          .eq('session_id', selectedSessionId)
          .maybeSingle();

        // Fetch clinician notes
        const { data: nData } = await (supabase.from('clinician_notes') as any)
          .select('*')
          .eq('session_id', selectedSessionId)
          .maybeSingle();

        setSessionDetail({
          metrics: mData || null,
          observation: oData || null,
          clinicianNote: nData || null,
        });

        if (nData?.note) {
          setClinicalNoteInput(nData.note);
        } else {
          setClinicalNoteInput("");
        }
      } catch (err) {
        console.error("Error loading session detail:", err);
      } finally {
        setLoadingDetail(false);
      }
    }

    loadDetail();
  }, [selectedSessionId]);

  // Handle saving clinical review and note
  const handleSaveReviewNote = async (markAsReviewed: boolean = true) => {
    if (!selectedSessionId || !slpId) return;
    try {
      setSavingNote(true);
      setSaveSuccessMsg(null);

      // 1. Upsert clinician note
      const currentNote = sessionDetail?.clinicianNote;
      if (currentNote) {
        await (supabase.from('clinician_notes') as any)
          .update({
            note: clinicalNoteInput,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentNote.id);
      } else if (clinicalNoteInput.trim()) {
        await (supabase.from('clinician_notes') as any)
          .insert({
            session_id: selectedSessionId,
            clinician_id: slpId,
            note: clinicalNoteInput
          });
      }

      // 2. Update session review_status
      const newStatus = markAsReviewed ? 'REVIEWED' : 'READY_FOR_REVIEW';
      await (supabase.from('sessions') as any)
        .update({ review_status: newStatus })
        .eq('id', selectedSessionId);

      // 3. Create Patient In-App Notification if marked as reviewed
      const currentSession = sessions.find(s => s.id === selectedSessionId);
      if (markAsReviewed && currentSession?.user_id) {
        try {
          const { data: existingNotif } = await (supabase.from('notifications') as any)
            .select('id')
            .eq('user_id', currentSession.user_id)
            .eq('session_id', selectedSessionId)
            .eq('type', 'SLP_REVIEW')
            .maybeSingle();

          if (!existingNotif) {
            await (supabase.from('notifications') as any)
              .insert({
                user_id: currentSession.user_id,
                session_id: selectedSessionId,
                type: 'SLP_REVIEW',
                title: 'Your SLP reviewed your practice session.',
                message: clinicalNoteInput.trim() 
                  ? `Clinical feedback: "${clinicalNoteInput.trim().slice(0, 100)}${clinicalNoteInput.trim().length > 100 ? '...' : ''}"`
                  : 'Your speech language pathologist has reviewed your session.',
                is_read: false
              });
          }
        } catch (nErr) {
          console.error("Failed to create patient notification:", nErr);
        }
      }

      // 4. Trigger Corsair Review Sync & Event
      try {
        const { data: { session: authSess } } = await supabase.auth.getSession();
        if (authSess) {
          await fetch(`/api/corsair/sync/clinician_review`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${authSess.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sessionId: selectedSessionId,
              slpId,
              note: clinicalNoteInput.trim(),
              status: newStatus
            })
          });
        }
      } catch (cErr) {
        console.warn("Corsair review sync error:", cErr);
      }

      // 5. Update local state
      setSessions(prev => prev.map(s => 
        s.id === selectedSessionId ? { ...s, review_status: newStatus } : s
      ));

      setSessionDetail(prev => prev ? {
        ...prev,
        clinicianNote: {
          ...(prev.clinicianNote || {}),
          note: clinicalNoteInput,
          updated_at: new Date().toISOString()
        }
      } : null);

      setSaveSuccessMsg(markAsReviewed ? "Session reviewed & note saved." : "Note updated successfully.");
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error("Error saving note:", err);
      setError("Failed to save clinician review note.");
    } finally {
      setSavingNote(false);
    }
  };

  const getSessionTitle = (session: SessionRecord) => {
    if (session.exercises?.name) return session.exercises.name;
    if (session.exercise_id) {
      const detail = getExerciseDetailsById(session.exercise_id);
      if (detail?.title) return detail.title;
      return "Exercise Routine";
    }
    return "General Practice";
  };

  const formatSessionDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = d.toLocaleDateString(undefined, { month: "short" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${day} ${month}, ${time}`;
  };

  // Filter and sort sessions
  const filteredSessions = sessions.filter(session => {
    // Status Filter
    if (statusFilter === "NEEDS_REVIEW" && session.review_status === "REVIEWED") {
      return false;
    }
    if (statusFilter === "REVIEWED" && session.review_status !== "REVIEWED") {
      return false;
    }

    // Patient Filter
    if (patientFilter !== "ALL" && session.user_id !== patientFilter) {
      return false;
    }

    // Type Filter
    if (typeFilter === "PRACTICE" && session.exercise_id !== null) {
      return false;
    }
    if (typeFilter === "EXERCISE" && session.exercise_id === null) {
      return false;
    }

    // Search Query (Patient Name, Email, or Exercise Name)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const patientName = session.profiles?.full_name?.toLowerCase() || "";
      const patientEmail = session.profiles?.email?.toLowerCase() || "";
      const exerciseTitle = getSessionTitle(session).toLowerCase();
      if (!patientName.includes(q) && !patientEmail.includes(q) && !exerciseTitle.includes(q)) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    if (sortBy === "newest") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortBy === "oldest") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    if (sortBy === "duration_desc") {
      return (Number(b.duration) || 0) - (Number(a.duration) || 0);
    }
    if (sortBy === "duration_asc") {
      return (Number(a.duration) || 0) - (Number(b.duration) || 0);
    }
    return 0;
  });

  const selectedSession = sessions.find(s => s.id === selectedSessionId) || null;

  // Counts for quick stats
  const totalCount = sessions.length;
  const needsReviewCount = sessions.filter(s => s.review_status !== 'REVIEWED').length;
  const reviewedCount = sessions.filter(s => s.review_status === 'REVIEWED').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Calendar className="w-6 h-6 text-teal-600" />
            Patient Sessions
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Review practice recordings, speech metrics, and AI observations across all your connected patients.
          </p>
        </div>

        {/* Quick Counters */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-center shadow-xs">
            <div className="text-xs text-slate-500 font-medium">Total</div>
            <div className="text-base font-bold text-slate-900">{totalCount}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-center shadow-xs">
            <div className="text-xs text-amber-700 font-medium">Needs Review</div>
            <div className="text-base font-bold text-amber-900">{needsReviewCount}</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-center shadow-xs">
            <div className="text-xs text-emerald-700 font-medium">Reviewed</div>
            <div className="text-base font-bold text-emerald-900">{reviewedCount}</div>
          </div>
        </div>
      </div>

      {/* Primary Mode Navigation Bar */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100 border border-slate-200/80 w-fit">
        <button
          onClick={() => setTopTab("live_sessions")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            topTab === "live_sessions"
              ? "bg-white text-indigo-700 shadow-xs border border-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Video className="w-4 h-4 text-indigo-600" />
          <span>Live Telehealth Sessions</span>
        </button>

        <button
          onClick={() => setTopTab("practice_logs")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            topTab === "practice_logs"
              ? "bg-white text-teal-700 shadow-xs border border-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Activity className="w-4 h-4 text-teal-600" />
          <span>Practice Recordings ({totalCount})</span>
        </button>

        <button
          onClick={() => setTopTab("availability")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            topTab === "availability"
              ? "bg-white text-slate-900 shadow-xs border border-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Clock className="w-4 h-4 text-slate-600" />
          <span>My Availability Schedule</span>
        </button>
      </div>

      {topTab === "live_sessions" ? (
        <SLPLiveSessionsTab />
      ) : topTab === "availability" ? (
        <SLPAvailabilityManager />
      ) : (
        <>
          {/* Practice Recordings View */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Status Tabs */}
          <div className="inline-flex bg-slate-100 p-1 rounded-lg self-start">
            <button
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                statusFilter === "ALL" 
                  ? "bg-white text-slate-900 shadow-xs" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter("NEEDS_REVIEW")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === "NEEDS_REVIEW" 
                  ? "bg-white text-amber-900 shadow-xs font-semibold" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Needs Review ({needsReviewCount})
            </button>
            <button
              onClick={() => setStatusFilter("REVIEWED")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === "REVIEWED" 
                  ? "bg-white text-emerald-900 shadow-xs font-semibold" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Reviewed ({reviewedCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search patient or exercise..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Secondary Filter Row: Patient & Type & Sorting */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          
          {/* Patient Selector */}
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-medium">Patient:</span>
            <select
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 py-1 px-2 rounded-md font-medium text-xs focus:ring-1 focus:ring-teal-500"
            >
              <option value="ALL">All Connected Patients ({activePatients.length})</option>
              {activePatients.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </div>

          {/* Session Type */}
          <div className="flex items-center gap-1.5 ml-auto sm:ml-2">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-medium">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-700 py-1 px-2 rounded-md font-medium text-xs focus:ring-1 focus:ring-teal-500"
            >
              <option value="ALL">All Sessions</option>
              <option value="PRACTICE">General Practice</option>
              <option value="EXERCISE">Exercise Routines</option>
            </select>
          </div>

          {/* Sort Order */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-slate-500 font-medium">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-700 py-1 px-2 rounded-md font-medium text-xs focus:ring-1 focus:ring-teal-500"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="duration_desc">Longest duration</option>
              <option value="duration_asc">Shortest duration</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid: Sessions List (Left) + Selected Session Details (Right / Drawer) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Sessions List */}
        <div className={`${selectedSession ? 'lg:col-span-6 xl:col-span-5' : 'lg:col-span-12'} space-y-3`}>
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-2 shadow-xs">
              <TableRowSkeleton count={5} />
            </div>
          ) : filteredSessions.length === 0 ? (
            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">No sessions match criteria</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {totalCount === 0 
                    ? "No sessions recorded yet for your connected patients." 
                    : "Try adjusting your filters or search query to find sessions."}
                </p>
                {totalCount > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setStatusFilter("ALL");
                      setPatientFilter("ALL");
                      setTypeFilter("ALL");
                      setSearchQuery("");
                      setCurrentPage(1);
                    }}
                    className="text-xs mt-2"
                  >
                    Reset Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredSessions.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((session) => {
                const isSelected = selectedSessionId === session.id;
                const patientName = session.profiles?.full_name || session.profiles?.email || "Patient";
                const isExercise = !!session.exercise_id;
                const sessionTypeLabel = isExercise ? "Exercise Routine" : "General Practice";
                const exerciseTitle = getSessionTitle(session);
                const isReviewed = session.review_status === "REVIEWED";

                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      setSelectedSessionId(session.id);
                      setSearchParams({ sessionId: session.id });
                    }}
                    className={`group cursor-pointer rounded-xl border p-4 transition-all ${
                      isSelected 
                        ? "bg-teal-50/70 border-teal-400 ring-2 ring-teal-500/20 shadow-xs" 
                        : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 shadow-xs"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      
                      {/* Left: Patient Avatar & Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          name={patientName}
                          src={session.profiles?.avatar_url}
                          size="md"
                          theme="indigo"
                          className="shrink-0"
                        />
                        <div className="min-w-0 space-y-0.5">
                          {/* Patient Name */}
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 text-sm truncate">
                              {patientName}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              isExercise 
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' 
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {sessionTypeLabel}
                            </span>
                          </div>

                          {/* Exercise / Routine Name */}
                          <div className="text-xs font-medium text-slate-700 truncate">
                            {exerciseTitle}
                          </div>

                          {/* Date & Duration */}
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{formatSessionDateTime(session.created_at)}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1 font-mono">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {formatDuration(session.duration)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Review Status Badge & Action */}
                      <div className="flex items-center gap-2.5 shrink-0">
                        {isReviewed ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal text-xs py-0.5">
                            Reviewed
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal text-xs py-0.5">
                            Needs Review
                          </Badge>
                        )}
                        <ChevronRight className={`w-4 h-4 transition-transform ${
                          isSelected ? 'text-teal-600 translate-x-0.5' : 'text-slate-400 group-hover:text-slate-600'
                        }`} />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Pagination Bar */}
              {filteredSessions.length > pageSize && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Showing {Math.min((currentPage - 1) * pageSize + 1, filteredSessions.length)}–
                    {Math.min(currentPage * pageSize, filteredSessions.length)} of {filteredSessions.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="h-8 px-2.5 text-xs bg-white"
                    >
                      Previous
                    </Button>
                    <span className="font-medium">{currentPage} / {Math.ceil(filteredSessions.length / pageSize)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage >= Math.ceil(filteredSessions.length / pageSize)}
                      onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredSessions.length / pageSize), p + 1))}
                      className="h-8 px-2.5 text-xs bg-white"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected Session Details Panel */}
        {selectedSession && (
          <div className="lg:col-span-6 xl:col-span-7 sticky top-4 animate-in fade-in duration-200">
            <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
              
              {/* Header */}
              <div className="bg-slate-50 border-b border-slate-200 p-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={selectedSession.profiles?.full_name || "Patient"}
                    src={selectedSession.profiles?.avatar_url}
                    size="lg"
                    theme="teal"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">
                        {selectedSession.profiles?.full_name || "Patient"}
                      </h2>
                      <Link
                        to={`/slp/patients/${selectedSession.user_id}`}
                        className="text-xs text-teal-600 hover:text-teal-800 font-medium inline-flex items-center gap-0.5 hover:underline"
                        title="Open full patient profile"
                      >
                        Profile <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                    <div className="text-xs text-slate-500">
                      {selectedSession.profiles?.email}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                      <span>{formatSessionDateTime(selectedSession.created_at)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono font-medium text-slate-700">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatDuration(selectedSession.duration)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedSession.review_status === 'REVIEWED' ? (
                    <Badge className="bg-emerald-100 text-emerald-800 font-normal">Reviewed</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800 font-normal">Needs Review</Badge>
                  )}
                  <button
                    onClick={() => {
                      setSelectedSessionId(null);
                      setSearchParams({});
                    }}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200/60"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <CardContent className="p-6 space-y-6">
                
                {/* Session Type & Exercise Title Banner */}
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {selectedSession.exercise_id ? "Exercise Routine" : "General Practice"}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {getSessionTitle(selectedSession)}
                    </div>
                  </div>
                  <span className="text-xs font-mono bg-white px-2.5 py-1 rounded border border-slate-200 text-slate-700">
                    Duration: {formatDuration(selectedSession.duration)}
                  </span>
                </div>

                {/* Audio Recording Player */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-teal-600" />
                    Patient Recording
                  </h3>
                  <AudioPlayer
                    sessionId={selectedSession.id}
                    initialDuration={selectedSession.duration}
                    onDurationLoaded={(dur) => {
                      const rounded = dur < 1 ? 1 : Math.round(dur);
                      if (selectedSession.duration !== rounded) {
                        setSessions(prev => prev.map(s => s.id === selectedSession.id ? { ...s, duration: rounded } : s));
                        (supabase.from("sessions") as any).update({ duration: rounded }).eq("id", selectedSession.id).then(() => {});
                      }
                    }}
                  />
                </div>

                {/* Objective Speech Observations / Metrics */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600" />
                    Speech Metrics
                  </h3>

                  {sessionDetail?.metrics ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                        <div className="text-[11px] text-slate-500 font-medium">Repetitions</div>
                        <div className="text-lg font-bold text-slate-900 mt-0.5">
                          {sessionDetail.metrics.repetitions ?? 0}
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                        <div className="text-[11px] text-slate-500 font-medium">Pauses</div>
                        <div className="text-lg font-bold text-slate-900 mt-0.5">
                          {sessionDetail.metrics.pauses ?? 0}
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                        <div className="text-[11px] text-slate-500 font-medium">Prolongations</div>
                        <div className="text-lg font-bold text-slate-900 mt-0.5">
                          {sessionDetail.metrics.prolongations ?? 0}
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                        <div className="text-[11px] text-slate-500 font-medium">Speech Rate</div>
                        <div className="text-lg font-bold text-slate-900 mt-0.5">
                          {sessionDetail.metrics.speech_rate ? `${Math.round(Number(sessionDetail.metrics.speech_rate))} WPM` : "N/A"}
                        </div>
                      </div>
                    </div>
                  ) : loadingDetail ? (
                    <div className="p-4 text-center text-xs text-slate-400">Loading metrics...</div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No automated speech metrics recorded for this session.</p>
                  )}
                </div>

                {/* Patient Practice Level Progression */}
                {sessionDetail?.metrics && (
                  <PracticeLevelMeter 
                    metrics={sessionDetail.metrics} 
                    practiceLevel={(selectedSession as any).practice_level} 
                  />
                )}

                {/* Corsair / SpeakEase AI Observation */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-indigo-600" />
                    AI Clinical Observations
                  </h3>
                  {sessionDetail?.observation ? (
                    <div className="p-3.5 rounded-lg bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-950 leading-relaxed">
                      {sessionDetail.observation.observation_text || sessionDetail.observation.observation}
                    </div>
                  ) : loadingDetail ? (
                    <div className="p-4 text-center text-xs text-slate-400">Loading observation...</div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No AI observations available.</p>
                  )}
                </div>

                {/* SLP Review & Clinical Notes */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-teal-600" />
                      Clinician Review & Notes
                    </h3>
                    {sessionDetail?.clinicianNote?.updated_at && (
                      <span className="text-[11px] text-slate-400">
                        Updated {new Date(sessionDetail.clinicianNote.updated_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <textarea
                    rows={3}
                    placeholder="Provide constructive clinical feedback, articulation notes, or exercise guidance for the patient..."
                    value={clinicalNoteInput}
                    onChange={(e) => setClinicalNoteInput(e.target.value)}
                    className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors placeholder:text-slate-400"
                  />

                  {saveSuccessMsg && (
                    <div className="p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{saveSuccessMsg}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSaveReviewNote(false)}
                      disabled={savingNote}
                      className="text-xs text-slate-700"
                    >
                      {savingNote ? "Saving..." : "Save Note (Draft)"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSaveReviewNote(true)}
                      disabled={savingNote}
                      className="text-xs bg-teal-600 hover:bg-teal-700 text-white font-medium gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {savingNote ? "Saving..." : "Save & Mark as Reviewed"}
                    </Button>
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>
        )}

      </div>
        </>
      )}
    </div>
  );
}
