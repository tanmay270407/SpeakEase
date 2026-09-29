import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/Avatar";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { 
  BookOpen, 
  CheckCircle2, 
  XCircle, 
  User, 
  Clock, 
  Activity, 
  Sparkles, 
  AlertCircle, 
  Layers, 
  ChevronRight, 
  ExternalLink,
  Search,
  Check,
  X,
  Info
} from "lucide-react";
import { formatDuration } from "../../lib/utils";
import { EXERCISE_DETAILS_CATALOG } from "../../data/exerciseDetailsData";

interface ExerciseItem {
  id: string;
  name: string;
  description: string | null;
  instructions?: string | null;
  category?: string | null;
  status?: string | null;
  duration?: number | null;
  created_at?: string;
  updated_at?: string;
}

interface PatientOption {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
}

interface AssignmentStatusMap {
  [patientId: string]: {
    [exerciseId: string]: boolean; // true = enabled, false = disabled/unassigned
  };
}

export function SLPExercises() {
  const { profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [slpId, setSlpId] = useState<string | null>(null);
  
  // Matrix of patient exercise statuses: patientId -> exerciseId -> boolean
  const [assignments, setAssignments] = useState<AssignmentStatusMap>({});
  
  // Selected patient for direct management card
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  
  // Action in flight
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filter/Search
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  useEffect(() => {
    async function loadData() {
      if (!profile?.id) return;
      try {
        setLoading(true);

        // 1. Fetch SLP ID
        const { data: slpData, error: slpErr } = await (supabase.from('slps') as any)
          .select('id')
          .eq('user_id', profile.id)
          .single();

        if (slpErr || !slpData) {
          throw new Error("Could not find SLP record.");
        }
        setSlpId(slpData.id);

        // 2. Fetch all exercises from DB (fallback/sync with catalog)
        const { data: exData, error: exErr } = await (supabase.from('exercises') as any)
          .select('*')
          .order('name', { ascending: true });

        if (exErr) throw exErr;

        let dbExercises: ExerciseItem[] = exData || [];
        if (dbExercises.length === 0) {
          // Fallback to catalog
          dbExercises = Object.values(EXERCISE_DETAILS_CATALOG).map(c => ({
            id: c.id,
            name: c.title,
            description: c.clinicalPurpose,
            instructions: c.instructions.join(' '),
            category: 'Speech Therapy Routine',
            status: 'active',
            duration: c.estimatedDurationSeconds
          }));
        }
        setExercises(dbExercises);

        // 3. Fetch active patients assigned to this SLP
        const { data: assignData, error: assignErr } = await (supabase.from('patient_assignments') as any)
          .select(`
            patient_id,
            status,
            profiles:patient_id ( id, full_name, email, avatar_url )
          `)
          .eq('slp_id', slpData.id)
          .eq('status', 'ACTIVE');

        if (assignErr) throw assignErr;

        const activePatients: PatientOption[] = (assignData || [])
          .map((a: any) => a.profiles)
          .filter(Boolean);
        setPatients(activePatients);

        if (activePatients.length > 0) {
          setSelectedPatientId(activePatients[0].id);

          // 4. Fetch all patient_exercises for these patients
          const patientIds = activePatients.map(p => p.id);
          const { data: peData, error: peErr } = await (supabase.from('patient_exercises') as any)
            .select('*')
            .in('patient_id', patientIds);

          if (!peErr && peData) {
            const map: AssignmentStatusMap = {};
            patientIds.forEach(pid => { map[pid] = {}; });
            
            peData.forEach((pe: any) => {
              if (!map[pe.patient_id]) map[pe.patient_id] = {};
              map[pe.patient_id][pe.exercise_id] = pe.status === 'enabled';
            });

            setAssignments(map);
          }
        }
      } catch (err: any) {
        console.error("Error loading SLP exercises data:", err);
        setFeedbackMsg({ text: err.message || "Failed to load exercises", type: "error" });
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [profile?.id]);

  // Handle toggling exercise status for a patient
  const handleToggleExercise = async (patientId: string, exerciseId: string, currentEnabled: boolean) => {
    if (!slpId) return;
    const newStatus = currentEnabled ? 'disabled' : 'enabled';
    const actionKey = `${patientId}_${exerciseId}`;
    setUpdatingId(actionKey);
    setFeedbackMsg(null);

    try {
      const { error: upsertErr } = await (supabase.from('patient_exercises') as any)
        .upsert({
          patient_id: patientId,
          exercise_id: exerciseId,
          assigned_by: slpId,
          status: newStatus,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'patient_id,exercise_id'
        });

      if (upsertErr) throw upsertErr;

      // Update state
      setAssignments(prev => ({
        ...prev,
        [patientId]: {
          ...(prev[patientId] || {}),
          [exerciseId]: !currentEnabled
        }
      }));

      const ex = exercises.find(e => e.id === exerciseId);
      const pat = patients.find(p => p.id === patientId);
      const exName = ex?.name || "Exercise";
      const patName = pat?.full_name || "Patient";

      setFeedbackMsg({
        text: `${newStatus === 'enabled' ? 'Enabled' : 'Disabled'} "${exName}" for ${patName}.`,
        type: 'success'
      });

      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      console.error("Error toggling exercise:", err);
      setFeedbackMsg({ text: err.message || "Failed to update exercise status", type: "error" });
    } finally {
      setUpdatingId(null);
    }
  };

  const categories = Array.from(new Set(exercises.map(e => e.category).filter(Boolean))) as string[];

  const filteredExercises = exercises.filter(ex => {
    if (categoryFilter !== "ALL" && ex.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = ex.name.toLowerCase().includes(q);
      const matchDesc = ex.description?.toLowerCase().includes(q) || false;
      const matchCat = ex.category?.toLowerCase().includes(q) || false;
      if (!matchName && !matchDesc && !matchCat) return false;
    }
    return true;
  });

  const selectedPatient = patients.find(p => p.id === selectedPatientId) || null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-teal-600" />
            Exercise Library & Patient Availability
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage the clinical exercise catalog and control specific exercise availability for your assigned patients.
          </p>
        </div>

        {/* Quick Library Counter */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-center shadow-xs">
            <div className="text-xs text-slate-500 font-medium">Library Exercises</div>
            <div className="text-base font-bold text-slate-900">{exercises.length}</div>
          </div>
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5 text-center shadow-xs">
            <div className="text-xs text-teal-700 font-medium">Active Patients</div>
            <div className="text-base font-bold text-teal-900">{patients.length}</div>
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div className={`p-4 rounded-md border text-xs sm:text-sm flex items-center justify-between ${
          feedbackMsg.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button 
            onClick={() => setFeedbackMsg(null)}
            className="text-xs font-semibold hover:underline opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-16 bg-white rounded-xl border border-slate-200">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin"></div>
            <p className="text-xs text-slate-500 font-medium">Loading clinical exercise library...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          
          {/* Section 1: Patient-Specific Availability Control */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-teal-600" />
                  Patient Exercise Availability Control
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a connected patient to toggle exercise availability in their mobile/web app.
                </p>
              </div>

              {/* Patient Selector */}
              {patients.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Patient:</span>
                  <select
                    value={selectedPatientId || ""}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-medium py-1.5 px-3 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  >
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.full_name || p.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {patients.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-lg border border-slate-200/80 space-y-2">
                <User className="w-8 h-8 text-slate-400 mx-auto" />
                <h3 className="text-sm font-semibold text-slate-800">No active patients connected</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Once you accept a connection request or invite a patient, you can manage their customized exercise routine availability here.
                </p>
              </div>
            ) : selectedPatient && (
              <div className="space-y-4">
                {/* Active Patient Details Banner */}
                <div className="p-4 bg-teal-50/50 rounded-lg border border-teal-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={selectedPatient.full_name}
                      src={selectedPatient.avatar_url}
                      size="md"
                      theme="teal"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{selectedPatient.full_name}</span>
                        <Link
                          to={`/slp/patients/${selectedPatient.id}`}
                          className="text-[11px] text-teal-700 hover:text-teal-900 font-medium inline-flex items-center gap-0.5 hover:underline"
                        >
                          View Profile <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      </div>
                      <span className="text-xs text-slate-500">{selectedPatient.email}</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 bg-white/80 px-3 py-1.5 rounded border border-teal-200/60 self-start sm:self-auto font-medium">
                    {Object.values(assignments[selectedPatient.id] || {}).filter(Boolean).length} of {exercises.length} Exercises Enabled
                  </div>
                </div>

                {/* Exercises Availability Cards for Selected Patient */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                  {exercises.map((exercise) => {
                    const isEnabled = assignments[selectedPatient.id]?.[exercise.id] || false;
                    const actionKey = `${selectedPatient.id}_${exercise.id}`;
                    const isUpdating = updatingId === actionKey;

                    return (
                      <div
                        key={exercise.id}
                        className={`rounded-xl border p-4.5 transition-all flex flex-col justify-between space-y-4 ${
                          isEnabled 
                            ? "bg-emerald-50/40 border-emerald-200 shadow-xs" 
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-slate-900 text-sm leading-snug">
                              {exercise.name}
                            </h3>
                            {isEnabled ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full shrink-0">
                                <Check className="w-3 h-3 text-emerald-600" />
                                Enabled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                                <X className="w-3 h-3 text-slate-400" />
                                Disabled
                              </span>
                            )}
                          </div>

                          {exercise.category && (
                            <div className="text-[11px] font-medium text-indigo-700">
                              {exercise.category}
                            </div>
                          )}

                          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            {exercise.description}
                          </p>
                        </div>

                        {/* Toggle Action */}
                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[11px] text-slate-400 font-mono">
                            {exercise.duration ? `${exercise.duration}s` : 'Standard'}
                          </span>

                          <Button
                            size="sm"
                            variant={isEnabled ? "outline" : "default"}
                            disabled={isUpdating}
                            onClick={() => handleToggleExercise(selectedPatient.id, exercise.id, isEnabled)}
                            className={`text-xs h-8 px-3 ${
                              isEnabled 
                                ? "border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300" 
                                : "bg-teal-600 hover:bg-teal-700 text-white"
                            }`}
                          >
                            {isUpdating ? (
                              <span className="inline-flex items-center gap-1">
                                <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin"></div>
                                Saving...
                              </span>
                            ) : isEnabled ? (
                              "Disable for Patient"
                            ) : (
                              "Enable for Patient"
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Clinical Exercise Library Catalog */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Clinical Exercise Library Catalog
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete repository of evidence-based speech and phonation routines available for prescription.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search library..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {categories.length > 0 && (
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-xs py-1.5 px-2.5 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ALL">All Categories</option>
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Exercise Catalog List */}
            <div className="space-y-3">
              {filteredExercises.map((exercise) => {
                const catalogDetail = EXERCISE_DETAILS_CATALOG[exercise.id];
                const activeCount = Object.values(assignments).filter(pMap => pMap[exercise.id]).length;

                return (
                  <Card key={exercise.id} className="border-slate-200 hover:border-slate-300 transition-colors shadow-none bg-slate-50/40">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-900 text-base">
                              {exercise.name}
                            </h3>
                            {exercise.category && (
                              <Badge variant="outline" className="text-indigo-700 bg-indigo-50 border-indigo-200 text-[11px]">
                                {exercise.category}
                              </Badge>
                            )}
                            <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                              Est. {exercise.duration ? `${exercise.duration}s` : '60s'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-3xl">
                            {exercise.description}
                          </p>
                        </div>

                        <div className="shrink-0 flex items-center gap-2 self-start sm:self-auto">
                          <span className="text-xs text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200 font-medium">
                            Assigned to <strong className="text-teal-700">{activeCount}</strong> of {patients.length} patients
                          </span>
                        </div>
                      </div>

                      {/* Instructions / Protocol */}
                      {exercise.instructions && (
                        <div className="p-3 bg-white rounded-lg border border-slate-200/80 text-xs text-slate-700 flex items-start gap-2">
                          <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <strong className="text-slate-900 font-semibold">Clinical Protocol:</strong>
                            <p className="text-slate-600 leading-relaxed">{exercise.instructions}</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Section 3: Patient Exercise Assignment Matrix */}
          {patients.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-600" />
                  Patient Availability Overview Matrix
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quick matrix showing current exercise prescription status across all connected patients.
                </p>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <tr>
                      <th className="p-3 font-semibold">Patient</th>
                      {exercises.map(ex => (
                        <th key={ex.id} className="p-3 font-semibold text-center whitespace-nowrap">
                          {ex.name}
                        </th>
                      ))}
                      <th className="p-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {patients.map(patient => (
                      <tr key={patient.id} className="hover:bg-slate-50/60">
                        <td className="p-3 font-medium text-slate-900">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={patient.full_name} src={patient.avatar_url} size="sm" />
                            <div>
                              <div className="font-semibold text-slate-900">{patient.full_name}</div>
                              <div className="text-[11px] text-slate-400">{patient.email}</div>
                            </div>
                          </div>
                        </td>

                        {exercises.map(ex => {
                          const isEnabled = assignments[patient.id]?.[ex.id] || false;
                          const actionKey = `${patient.id}_${ex.id}`;
                          const isUpdating = updatingId === actionKey;

                          return (
                            <td key={ex.id} className="p-3 text-center">
                              <button
                                onClick={() => handleToggleExercise(patient.id, ex.id, isEnabled)}
                                disabled={isUpdating}
                                className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-all ${
                                  isEnabled
                                    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                }`}
                                title={isEnabled ? `Enabled for ${patient.full_name}. Click to disable.` : `Disabled for ${patient.full_name}. Click to enable.`}
                              >
                                {isUpdating ? (
                                  <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin"></div>
                                ) : isEnabled ? (
                                  <Check className="w-4 h-4 text-emerald-700" />
                                ) : (
                                  <X className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </button>
                            </td>
                          );
                        })}

                        <td className="p-3 text-right">
                          <Link
                            to={`/slp/patients/${patient.id}`}
                            className="text-teal-600 hover:text-teal-800 font-semibold inline-flex items-center gap-1 hover:underline"
                          >
                            Profile <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
