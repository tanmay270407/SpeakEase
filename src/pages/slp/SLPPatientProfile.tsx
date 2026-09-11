import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { AudioPlayer } from "../../components/AudioPlayer";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/Avatar";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { User, Clock, CheckCircle, FileText, BrainCircuit, MessageSquare, AlertCircle, Activity, Target, BookOpen, Check, X, Video } from "lucide-react";
import { formatDuration } from "../../lib/utils";
import { getExerciseDetailsById, EXERCISE_DETAILS_CATALOG } from "../../data/exerciseDetailsData";
import { SLPBookSessionModal } from "../../components/slp/SLPBookSessionModal";

export function SLPPatientProfile() {
  const { id } = useParams<{ id: string }>(); // Patient ID
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  
  const [patient, setPatient] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<Record<string, any>>({});
  const [observations, setObservations] = useState<Record<string, any>>({});
  const [clinicianNotes, setClinicianNotes] = useState<Record<string, any>>({});
  
  const [slpId, setSlpId] = useState<string | null>(null);

  // Exercise Assignments State
  const [allExercises, setAllExercises] = useState<any[]>([]);
  const [exerciseAssignments, setExerciseAssignments] = useState<Record<string, boolean>>({});
  const [updatingExerciseId, setUpdatingExerciseId] = useState<string | null>(null);
  const [exerciseAlert, setExerciseAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // New Note State
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [reviewAlert, setReviewAlert] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // Book Live Session Modal State
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);

  useEffect(() => {
    async function loadPatientData() {
      try {
        setLoading(true);
        if (!profile?.id || !id) return;

        // 1. Get SLP ID
        const { data: slpData } = await (supabase.from('slps') as any)
          .select('id')
          .eq('user_id', profile.id)
          .single();

        if (!slpData) return;
        setSlpId(slpData.id);

        // 2. Verify Assignment & Get Patient Profile
        const { data: assignment } = await (supabase.from('patient_assignments') as any)
          .select(`
            status,
            profiles!patient_assignments_patient_id_fkey (
              id, full_name, email, avatar_url, bio, practice_goal
            )
          `)
          .eq('slp_id', slpData.id)
          .eq('patient_id', id)
          .single();

        if (!assignment || !assignment.profiles) {
          throw new Error("Patient not found or not assigned to you.");
        }
        setPatient({
          ...assignment.profiles,
          assignmentStatus: assignment.status || 'ACTIVE',
        });

        // 3. Load All Exercises & Patient's Enabled Exercises
        const { data: exData } = await (supabase.from('exercises') as any)
          .select('*')
          .order('name', { ascending: true });

        let exList = exData || [];
        if (exList.length === 0) {
          exList = Object.values(EXERCISE_DETAILS_CATALOG).map(c => ({
            id: c.id,
            name: c.title,
            description: c.clinicalPurpose,
            category: 'Speech Therapy Routine',
            status: 'active',
            duration: c.estimatedDurationSeconds
          }));
        }
        setAllExercises(exList);

        const { data: peData } = await (supabase.from('patient_exercises') as any)
          .select('*')
          .eq('patient_id', id);

        const assignMap: Record<string, boolean> = {};
        peData?.forEach((pe: any) => {
          assignMap[pe.exercise_id] = pe.status === 'enabled';
        });
        setExerciseAssignments(assignMap);

        // 4. Get Sessions
        const { data: sessionData } = await (supabase.from('sessions') as any)
          .select(`
            *,
            exercises ( name )
          `)
          .eq('user_id', id)
          .order('created_at', { ascending: false });

        const sData = sessionData || [];
        setSessions(sData);

        if (sData.length > 0) {
          const sessionIds = sData.map((s: any) => s.id);

          // Get Metrics
          const { data: mData } = await (supabase.from('speech_metrics') as any).select('*').in('session_id', sessionIds);
          const metricsMap: any = {};
          mData?.forEach((m: any) => metricsMap[m.session_id] = m);
          setMetrics(metricsMap);

          // Get AI Observations
          const { data: oData } = await (supabase.from('ai_observations') as any).select('*').in('session_id', sessionIds);
          const obsMap: any = {};
          oData?.forEach((o: any) => obsMap[o.session_id] = o);
          setObservations(obsMap);

          // Get Clinician Notes
          const { data: nData } = await (supabase.from('clinician_notes') as any).select('*').in('session_id', sessionIds);
          const notesMap: any = {};
          nData?.forEach((n: any) => notesMap[n.session_id] = n);
          setClinicianNotes(notesMap);
        }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadPatientData();
  }, [profile?.id, id]);

  const handleToggleExercise = async (exerciseId: string, currentEnabled: boolean) => {
    if (!slpId || !id) return;
    const newStatus = currentEnabled ? 'disabled' : 'enabled';
    setUpdatingExerciseId(exerciseId);
    setExerciseAlert(null);

    try {
      const { error } = await (supabase.from('patient_exercises') as any)
        .upsert({
          patient_id: id,
          exercise_id: exerciseId,
          assigned_by: slpId,
          status: newStatus,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'patient_id,exercise_id'
        });

      if (error) throw error;

      setExerciseAssignments(prev => ({
        ...prev,
        [exerciseId]: !currentEnabled
      }));

      const ex = allExercises.find(e => e.id === exerciseId);
      setExerciseAlert({
        type: 'success',
        message: `${newStatus === 'enabled' ? 'Enabled' : 'Disabled'} "${ex?.name || 'Exercise'}" for ${patient?.full_name || 'Patient'}.`
      });

      setTimeout(() => setExerciseAlert(null), 4000);
    } catch (err: any) {
      console.error("Error toggling exercise availability:", err);
      setExerciseAlert({
        type: 'error',
        message: err.message || 'Failed to update exercise availability'
      });
    } finally {
      setUpdatingExerciseId(null);
    }
  };

  const handleSaveNote = async (sessionId: string) => {
    if (!newNote.trim() || !slpId || !id) return;
    setReviewAlert(null);
    try {
      setSavingNote(true);

      // 1. Save the clinician review in the existing clinician_notes table
      const { data: noteData, error: noteError } = await (supabase.from('clinician_notes') as any)
        .insert({
          session_id: sessionId,
          clinician_id: slpId,
          note: newNote.trim()
        }).select().single();

      if (noteError) throw noteError;

      // 2. Update the session review status
      const { error: sessionUpdateError } = await (supabase.from('sessions') as any)
        .update({ review_status: 'REVIEWED' })
        .eq('id', sessionId);

      if (sessionUpdateError) {
        console.error("Failed to update session review_status:", sessionUpdateError);
      }

      // 3. Create a patient notification associated with patient and session
      let notificationDelivered = false;
      try {
        const { error: notifError } = await (supabase.from('notifications') as any)
          .insert({
            user_id: id, // Patient authenticated user ID
            session_id: sessionId,
            type: 'SLP_REVIEW',
            title: 'Your SLP reviewed your practice session.',
            message: 'Your speech language pathologist has reviewed your session and added clinical feedback.',
            is_read: false
          });

        if (notifError) {
          console.error("Notification creation failed:", notifError);
        } else {
          notificationDelivered = true;
        }
      } catch (nErr) {
        console.error("Exception creating notification:", nErr);
      }

      // 4. Trigger Corsair Review Sync & Event
      let corsairSynced = false;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const syncRes = await fetch(`/api/corsair/sync/clinician_review`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sessionId,
              slpId,
              note: newNote.trim(),
              status: 'REVIEWED'
            })
          });
          if (syncRes.ok) corsairSynced = true;
        }
      } catch (e) {
        console.warn("Corsair sync attempt failed:", e);
      }

      // 5. Update local state
      setClinicianNotes(prev => ({ ...prev, [sessionId]: noteData }));
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, review_status: 'REVIEWED' } : s));
      
      setNewNote("");
      setActiveSessionId(null);

      // Error handling / feedback state
      if (notificationDelivered) {
        setReviewAlert({
          type: 'success',
          message: 'Clinician review submitted successfully. Patient notification delivered.'
        });
      } else {
        setReviewAlert({
          type: 'warning',
          message: 'Clinician review saved, but patient notification delivery could not be completed.'
        });
      }
    } catch (err: any) {
      console.error("Review submission error:", err);
      setReviewAlert({
        type: 'error',
        message: err.message || 'Failed to save clinician review. Please try again.'
      });
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500">
        <AlertCircle className="h-12 w-12 text-slate-300 mb-4" />
        <p>Patient not found or access denied.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Patient Minimal Profile Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar
              src={patient.avatar_url}
              name={patient.full_name}
              size="lg"
              theme="indigo"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">{patient.full_name}</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100/80">
                  Patient
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{patient.email}</p>
            </div>
          </div>

          <div className="sm:self-center flex items-center gap-2">
            {patient.assignmentStatus === "ACTIVE" && (
              <Button
                onClick={() => setIsBookModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 h-auto cursor-pointer shadow-2xs"
              >
                <Video className="w-3.5 h-3.5 mr-1.5" />
                Book Live Session
              </Button>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Connected
            </span>
          </div>
        </div>

        {/* Bio & Practice Goal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">About</h3>
            <p className="text-sm text-slate-700 mt-1">
              {patient.bio || "No personal bio provided."}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <Target className="w-3.5 h-3.5 text-indigo-500" />
              <span>Practice Goal</span>
            </div>
            <p className="text-sm text-slate-700 mt-1">
              {patient.practice_goal || "Speech fluency and clarity improvement."}
            </p>
          </div>
        </div>
      </div>

      {/* Patient Recording Statistics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-md">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Sessions</p>
                <p className="text-xl font-bold text-slate-900">{sessions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-md">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Practice Time</p>
                <p className="text-xl font-bold text-slate-900">
                  {formatDuration(sessions.reduce((acc, s) => acc + (Number(s.duration) || 0), 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-md">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Needs Review</p>
                <p className="text-xl font-bold text-slate-900">
                  {sessions.filter(s => s.review_status !== 'REVIEWED').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assigned Exercises Availability Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-teal-600" />
              Exercises Availability
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enable or disable specific speech therapy routines for {patient.full_name}.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 self-start sm:self-auto">
            {Object.values(exerciseAssignments).filter(Boolean).length} of {allExercises.length} Enabled
          </span>
        </div>

        {exerciseAlert && (
          <div className={`p-3 rounded-md border text-xs flex items-center justify-between ${
            exerciseAlert.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2">
              {exerciseAlert.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600" />
              )}
              <span>{exerciseAlert.message}</span>
            </div>
            <button
              onClick={() => setExerciseAlert(null)}
              className="text-xs font-semibold hover:underline opacity-80"
            >
              Dismiss
            </button>
          </div>
        )}

        {allExercises.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No exercises found in the catalog.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {allExercises.map((exercise) => {
              const isEnabled = exerciseAssignments[exercise.id] || false;
              const isUpdating = updatingExerciseId === exercise.id;

              return (
                <div
                  key={exercise.id}
                  className={`rounded-lg border p-4 flex flex-col justify-between space-y-3 transition-all ${
                    isEnabled
                      ? 'bg-emerald-50/40 border-emerald-200 shadow-2xs'
                      : 'bg-slate-50/60 border-slate-200'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span
                          className={`font-mono text-base font-bold shrink-0 mt-[-2px] ${
                            isEnabled ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {isEnabled ? '✓' : '○'}
                        </span>
                        <h3 className="font-semibold text-slate-900 text-sm leading-snug">
                          {exercise.name}
                        </h3>
                      </div>
                    </div>

                    {exercise.category && (
                      <div className="text-[11px] font-medium text-indigo-700 pl-5">
                        {exercise.category}
                      </div>
                    )}

                    <p className="text-xs text-slate-600 pl-5 line-clamp-2 leading-relaxed">
                      {exercise.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between pl-5">
                    <span className="text-[11px] text-slate-400 font-mono">
                      {exercise.duration ? `${exercise.duration}s` : '60s'}
                    </span>

                    <Button
                      size="sm"
                      variant={isEnabled ? "outline" : "default"}
                      disabled={isUpdating}
                      onClick={() => handleToggleExercise(exercise.id, isEnabled)}
                      className={`text-xs h-7 px-3 ${
                        isEnabled
                          ? 'border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300'
                          : 'bg-teal-600 hover:bg-teal-700 text-white'
                      }`}
                    >
                      {isUpdating ? 'Saving...' : isEnabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {reviewAlert && (
        <div
          className={`p-4 rounded-md border text-sm flex items-center justify-between ${
            reviewAlert.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : reviewAlert.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {reviewAlert.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600" />
            )}
            <span>{reviewAlert.message}</span>
          </div>
          <button
            onClick={() => setReviewAlert(null)}
            className="text-xs font-medium underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-900">Session History</h2>
        
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No practice sessions found for this patient.</p>
        ) : (
          <div className="space-y-6">
            {sessions.map((session) => {
              const exerciseTitle = session.exercises?.name || (session.exercise_id ? getExerciseDetailsById(session.exercise_id)?.title || 'Exercise Routine' : 'Practice Session');
              return (
              <Card key={session.id} className="overflow-hidden border-slate-200">
                <CardHeader className="bg-slate-50 border-b border-slate-100 py-4 flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <CardTitle className="text-base font-semibold text-slate-900">
                      {exerciseTitle}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{new Date(session.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDuration(session.duration)}
                      </span>
                    </CardDescription>
                  </div>
                  {session.review_status === 'REVIEWED' ? (
                    <Badge className="bg-emerald-100 text-emerald-800 font-normal">Reviewed</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800 font-normal">Needs Review</Badge>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                    
                    {/* Left Col: Metrics */}
                    <div className="p-6 space-y-6">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-3 uppercase tracking-wider flex items-center gap-2">
                          <Activity className="w-4 h-4 text-slate-500" />
                          Speech Observations
                        </h3>
                        {metrics[session.id] ? (
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-600">Possible repetitions:</span>
                              <span className="font-medium text-slate-900">{metrics[session.id].repetitions}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Pauses:</span>
                              <span className="font-medium text-slate-900">{metrics[session.id].pauses}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Speech rate:</span>
                              <span className="font-medium text-slate-900">{metrics[session.id].speech_rate} wpm</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500 italic">No metrics recorded.</p>
                        )}
                      </div>

                      
    {/* Audio Player Block */}
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-900 mb-3 uppercase tracking-wider flex items-center gap-2">
        <Activity className="w-4 h-4 text-slate-500" />
        Recording
      </h3>
      <AudioPlayer 
        sessionId={session.id} 
        initialDuration={session.duration} 
        onDurationLoaded={(dur) => {
          const rounded = dur < 1 ? 1 : Math.round(dur);
          if (session.duration !== rounded) {
            setSessions(prev => prev.map(s => s.id === session.id ? { ...s, duration: rounded } : s));
            (supabase.from("sessions") as any).update({ duration: rounded }).eq("id", session.id).then(() => {});
          }
        }}
      />
    </div>
    {/* AI Observation Block */}
  
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-3 uppercase tracking-wider flex items-center gap-2">
                          <BrainCircuit className="w-4 h-4 text-indigo-500" />
                          AI Observation
                        </h3>
                        {observations[session.id] ? (
                          <div className="rounded-md bg-indigo-50 border border-indigo-100 p-3 text-sm text-indigo-900 leading-relaxed">
                            {observations[session.id].observation_text || observations[session.id].observation}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500 italic">No AI observation available.</p>
                        )}
                      </div>
                    </div>

                    {/* Right Col: Clinician Note */}
                    <div className="p-6">
                      <h3 className="text-sm font-semibold text-slate-900 mb-3 uppercase tracking-wider flex items-center gap-2">
                        <FileText className="w-4 h-4 text-teal-600" />
                        Clinician Note
                      </h3>
                      
                      {clinicianNotes[session.id] ? (
                        <div className="rounded-md bg-teal-50 border border-teal-100 p-3 text-sm text-teal-900 leading-relaxed whitespace-pre-wrap">
                          {clinicianNotes[session.id].note}
                        </div>
                      ) : (
                        <div>
                          {activeSessionId === session.id ? (
                            <div className="space-y-3">
                              <textarea 
                                className="w-full min-h-[100px] text-sm p-3 border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                                placeholder="Add your clinical note here. This will mark the session as reviewed."
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                              />
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => { setActiveSessionId(null); setNewNote(""); }}
                                  disabled={savingNote}
                                >
                                  Cancel
                                </Button>
                                <Button 
                                  size="sm"
                                  className="bg-teal-600 hover:bg-teal-700 text-white"
                                  onClick={() => handleSaveNote(session.id)}
                                  disabled={savingNote || !newNote.trim()}
                                >
                                  {savingNote ? "Saving..." : "Save Note"}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button 
                              variant="outline" 
                              className="w-full border-dashed text-teal-700 border-teal-200 hover:bg-teal-50 hover:border-teal-300"
                              onClick={() => { setActiveSessionId(session.id); setNewNote(""); }}
                            >
                              <MessageSquare className="w-4 h-4 mr-2" />
                              Add Clinical Note
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>

      <SLPBookSessionModal
        isOpen={isBookModalOpen}
        onClose={() => setIsBookModalOpen(false)}
        preselectedPatientId={patient.id}
      />
    </div>
  );
}
