import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { AudioPlayer } from "../../components/AudioPlayer";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { User, Clock, CheckCircle, FileText, BrainCircuit, MessageSquare, AlertCircle, Activity } from "lucide-react";

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

  // New Note State
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

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
            profiles!patient_assignments_patient_id_fkey (
              id, full_name, email
            )
          `)
          .eq('slp_id', slpData.id)
          .eq('patient_id', id)
          .single();

        if (!assignment || !assignment.profiles) {
          throw new Error("Patient not found or not assigned to you.");
        }
        setPatient(assignment.profiles);

        // 3. Get Sessions
        const { data: sessionData } = await (supabase.from('sessions') as any)
          .select('*')
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

  const handleSaveNote = async (sessionId: string) => {
    if (!newNote.trim() || !slpId) return;
    try {
      setSavingNote(true);

      // Insert note
      const { data: noteData, error: noteError } = await (supabase.from('clinician_notes') as any)
        .insert({
          session_id: sessionId,
          clinician_id: slpId,
          note: newNote.trim()
        }).select().single();

      if (noteError) throw noteError;

      // Update session status
      await (supabase.from('sessions') as any)
        .update({ review_status: 'REVIEWED' })
        .eq('id', sessionId);

      // Trigger Corsair Sync
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          fetch(`/api/corsair/sync/clinician_review`, {
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
          }).catch(() => {}); // Fire and forget
        }
      } catch (e) {
        console.warn("Corsair sync attempt failed");
      }

      // Update local state
      setClinicianNotes(prev => ({ ...prev, [sessionId]: noteData }));
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, review_status: 'REVIEWED' } : s));
      
      setNewNote("");
      setActiveSessionId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNote(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
      <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
          <User className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{patient.full_name}</h1>
          <p className="text-slate-500">{patient.email}</p>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-900">Session History</h2>
        
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No practice sessions found for this patient.</p>
        ) : (
          <div className="space-y-6">
            {sessions.map((session) => (
              <Card key={session.id} className="overflow-hidden border-slate-200">
                <CardHeader className="bg-slate-50 border-b border-slate-100 py-4 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-medium">
                      {new Date(session.created_at).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatTime(session.duration)} duration
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
      <AudioPlayer sessionId={session.id} />
    </div>
    {/* AI Observation Block */}
  
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-3 uppercase tracking-wider flex items-center gap-2">
                          <BrainCircuit className="w-4 h-4 text-indigo-500" />
                          AI Observation
                        </h3>
                        {observations[session.id] ? (
                          <div className="rounded-md bg-indigo-50 border border-indigo-100 p-3 text-sm text-indigo-900 leading-relaxed">
                            {observations[session.id].observation_text}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
