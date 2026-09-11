import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Mic, Square, Shield, AlertCircle, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { formatDuration } from "../../lib/utils";
import { getAuthoritativeAudioDuration } from "../../lib/audioDuration";
import { getExerciseDetailsById, ExerciseDetail } from "../../data/exerciseDetailsData";
import { ExerciseProgressTracker } from "../../components/ExerciseProgressTracker";

export function ExerciseRecordingPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [exercise, setExercise] = useState<ExerciseDetail>(() => getExerciseDetailsById(exerciseId));
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(true);

  // Sync with DB if available and check patient assignment
  useEffect(() => {
    let isMounted = true;
    async function loadExercise() {
      if (!exerciseId) return;
      try {
        setCheckingAvailability(true);
        if (profile?.id) {
          const { data: peData } = await (supabase.from("patient_exercises") as any)
            .select("status")
            .eq("patient_id", profile.id)
            .eq("exercise_id", exerciseId)
            .maybeSingle();

          if (isMounted) {
            setIsAvailable(peData?.status === 'enabled');
          }
        }

        const { data } = await (supabase.from("exercises") as any)
          .select("id, name, description, duration")
          .eq("id", exerciseId)
          .maybeSingle();

        if (data && isMounted) {
          setExercise(prev => ({
            ...prev,
            id: data.id,
            title: data.name || prev.title,
            clinicalPurpose: data.description || prev.clinicalPurpose,
          }));
        }
      } catch (err) {
        console.warn("Could not fetch exercise from DB:", err);
      } finally {
        if (isMounted) {
          setCheckingAvailability(false);
        }
      }
    }
    loadExercise();
    return () => {
      isMounted = false;
    };
  }, [exerciseId, profile?.id]);

  // Step state: consent -> ready -> recording -> processing -> processing_error
  const [step, setStep] = useState<'consent' | 'ready' | 'recording' | 'processing' | 'processing_error'>('consent');
  const [consentId, setConsentId] = useState<string | null>(null);
  const [isSubmittingConsent, setIsSubmittingConsent] = useState(false);

  const [recordingState, setRecordingState] = useState<'idle' | 'requesting' | 'recording' | 'stopped' | 'error' | 'denied'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [duration, setDuration] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const stopTimeRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const timerRef = useRef<number | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);

  // Exercise Consent: Explicit action required
  const handleAgree = async () => {
    if (!profile?.id) return;
    setIsSubmittingConsent(true);
    setErrorMsg(null);
    try {
      const { data, error } = await (supabase.from('consents') as any).insert({
        user_id: profile.id,
        consent_type: 'AUDIO_RECORDING_ANALYSIS'
      }).select().single();

      if (error) throw error;

      setConsentId(data?.id || null);
      setStep('ready');
      setRecordingState('idle');
    } catch (err: any) {
      console.error("Exercise consent error:", err);
      setErrorMsg("Failed to save consent. Please try again.");
    } finally {
      setIsSubmittingConsent(false);
    }
  };

  const handleCancel = () => {
    navigate(`/exercises/${exercise.id}`);
  };

  const startRecording = async () => {
    setErrorMsg(null);
    setRecordingState('requesting');
    audioChunksRef.current = [];
    setDuration(0);
    startTimeRef.current = null;
    stopTimeRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstart = () => {
        startTimeRef.current = Date.now();
        setRecordingState('recording');
        setStep('recording');
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => {
          if (startTimeRef.current) {
            const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
            setDuration(elapsed);
          }
        }, 200);
      };

      mediaRecorder.onstop = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (!stopTimeRef.current) {
          stopTimeRef.current = Date.now();
        }
        handleRecordingStop();
      };

      mediaRecorder.start(100);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setRecordingState('denied');
      } else {
        setRecordingState('error');
        setErrorMsg(err.message || 'Could not access microphone');
      }
    }
  };

  const stopRecording = () => {
    stopTimeRef.current = Date.now();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      setRecordingState('stopped');
    }
  };

  const handleRecordingStop = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    if (audioBlob.size === 0) {
      setRecordingState('error');
      setErrorMsg("Audio could not be saved.");
      return;
    }
    audioBlobRef.current = audioBlob;

    setStep('processing');

    try {
      let authoritativeDuration = await getAuthoritativeAudioDuration(audioBlob);
      if (authoritativeDuration <= 0 && audioBlob.size > 0) {
        authoritativeDuration = 1;
      }

      setDuration(authoritativeDuration);

      // Create session linked to THIS specific Exercise
      const { data: sessionData, error: sessionError } = await (supabase.from('sessions') as any).insert({
        user_id: profile!.id,
        exercise_id: exercise.id,
        duration: authoritativeDuration,
        review_status: 'NOT_REVIEWED'
      }).select().single();

      if (sessionError) throw sessionError;

      if (consentId && sessionData) {
        await (supabase.from('consents') as any).update({ session_id: sessionData.id }).eq('id', consentId);
      }

      const newSessionId = sessionData?.id;
      setSessionId(newSessionId || null);

      if (newSessionId) {
        // Automatically start speech analysis in background
        processAudio(newSessionId, audioBlob).catch(err => {
          console.warn("Background audio processing notice:", err);
        });
        // Immediately navigate to exercise results page
        navigate(`/exercises/${exercise.id}/results/${newSessionId}`);
      }
    } catch (err: any) {
      console.error(err);
      setRecordingState('error');
      setErrorMsg(err.message === "Audio could not be saved." ? "Audio could not be saved." : "Failed to save exercise session data.");
      setStep('ready');
    }
  };

  const processAudio = async (currentSessionId: string, audioData?: Blob | null) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      let response;
      if (audioData) {
        const formData = new FormData();
        formData.append('sessionId', currentSessionId);
        formData.append('audio', audioData, 'recording.webm');

        response = await fetch('/api/analyze-speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          },
          body: formData
        });
      } else {
        response = await fetch(`/api/sessions/${currentSessionId}/retry-analysis`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        });
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to process audio');
      }
    } catch (err: any) {
      console.error('Background audio processing error:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  if (checkingAvailability) {
    return (
      <div className="flex items-center justify-center min-h-[350px]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  if (isAvailable === false) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Exercise Not Enabled</h2>
        <p className="text-sm text-slate-600">
          This exercise routine has not been enabled for your care plan by your Speech-Language Pathologist.
        </p>
        <div className="pt-4 flex items-center justify-center gap-3">
          <Link to="/exercises">
            <Button variant="outline">Back to Prescribed Exercises</Button>
          </Link>
          <Link to="/practice">
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">Go to General Practice</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      {/* Exercise Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link 
          to={`/exercises/${exercise.id}`} 
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          id="exercise-back-to-overview-link"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {exercise.title}
        </Link>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
          Exercise Routine
        </span>
      </div>

      {/* Progress Flow Tracker */}
      <ExerciseProgressTracker
        currentStep="record"
        onStepClick={(targetStep) => {
          if (targetStep === 'instructions') {
            navigate(`/exercises/${exercise.id}`);
          }
        }}
      />

      {/* 1. EXERCISE CONSENT STEP */}
      {step === 'consent' && (
        <Card id="exercise-consent-card" className="border-slate-200 shadow-sm max-w-xl mx-auto bg-white">
          <CardContent className="pt-8 pb-8 px-6 space-y-6 text-center">
            <div className="mx-auto bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-indigo-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">Exercise Recording Consent</h2>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700">
                Selected Routine: <span className="font-semibold text-slate-900">{exercise.title}</span>
              </div>
              <p className="text-slate-600 max-w-sm mx-auto text-sm leading-relaxed">
                Your audio will be securely stored to analyze this exercise routine and will be available for clinical review by your assigned speech-language pathologist.
              </p>
            </div>
            {errorMsg && (
              <div className="text-red-500 text-sm flex items-center justify-center gap-1.5 bg-red-50 p-2 rounded-md border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={handleCancel} 
                className="w-full sm:w-auto"
                id="exercise-consent-cancel-btn"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleAgree} 
                disabled={isSubmittingConsent}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                id="exercise-consent-agree-btn"
              >
                {isSubmittingConsent ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Recording Consent...
                  </>
                ) : (
                  "I Agree"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. EXERCISE RECORDING STEP */}
      {(step === 'ready' || step === 'recording') && (
        <div id="exercise-recording-container" className="space-y-6 animate-in fade-in duration-200">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {exercise.title}
            </h1>
            <p className="text-slate-600 max-w-xl mx-auto text-sm">
              {exercise.clinicalPurpose}
            </p>
          </div>

          {/* Exercise-Specific Practice Content (NEVER the practice reading paragraph) */}
          <Card id="exercise-practice-content-card" className="border-slate-200 shadow-sm bg-white overflow-hidden">
            <div className="bg-slate-50/80 px-6 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Exercise Prompts</h2>
              <span className="text-xs text-slate-500 font-medium">Est: {exercise.estimatedDuration}</span>
            </div>
            <CardContent className="p-6 sm:p-8 space-y-6">
              {exercise.practiceSections && exercise.practiceSections.length > 0 ? (
                exercise.practiceSections.map((section, idx) => (
                  <div key={idx} className="space-y-3">
                    {section.heading && (
                      <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                        {section.heading}
                      </h3>
                    )}
                    {section.subheading && (
                      <p className="text-xs text-slate-500 italic">
                        {section.subheading}
                      </p>
                    )}
                    <div className="grid gap-2">
                      {section.items.map((item, itemIdx) => (
                        <div 
                          key={itemIdx} 
                          className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-lg sm:text-xl font-medium text-slate-900 text-center tracking-wide"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 bg-slate-50 rounded-lg border border-slate-200 text-lg font-medium text-slate-900 whitespace-pre-line text-center">
                  {exercise.plainPracticeText}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recording Controls */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardContent className="p-8 flex flex-col items-center text-center space-y-6">
              <div 
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  recordingState === 'recording' 
                    ? 'bg-red-50 text-red-600 animate-pulse ring-8 ring-red-100' 
                    : recordingState === 'error' || recordingState === 'denied' 
                    ? 'bg-red-50 text-red-600' 
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Mic className="w-9 h-9" />
              </div>

              {/* Timer */}
              <div className="text-4xl font-light text-slate-900 font-mono tracking-tight">
                {formatDuration(duration)}
              </div>

              <p className="text-slate-500 text-sm">
                {recordingState === 'idle' ? 'Ready to record exercise' : 
                 recordingState === 'requesting' ? 'Requesting microphone...' : 
                 recordingState === 'recording' ? 'Recording in progress... Perform the exercise steadily' : 
                 recordingState === 'error' || recordingState === 'denied' ? 'Recording failed' : 'Stopped'}
              </p>

              {recordingState === 'error' && (
                <div className="flex items-center justify-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-md text-sm max-w-md">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {recordingState === 'denied' && (
                <div className="flex items-center justify-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-md text-sm max-w-md text-left">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>Microphone access was denied. Please allow microphone permissions in your browser to record this exercise.</span>
                </div>
              )}

              <div>
                {recordingState === 'idle' || recordingState === 'error' || recordingState === 'denied' ? (
                  <Button 
                    onClick={startRecording} 
                    size="lg" 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-8 py-6 text-base font-semibold shadow-sm gap-2"
                    id="exercise-start-recording-btn"
                  >
                    <Mic className="w-5 h-5" />
                    Start Recording
                  </Button>
                ) : recordingState === 'recording' ? (
                  <Button 
                    onClick={stopRecording} 
                    size="lg" 
                    variant="outline" 
                    className="border-red-200 hover:bg-red-50 hover:text-red-700 text-red-600 rounded-full px-8 py-6 text-base font-semibold gap-2"
                    id="exercise-stop-recording-btn"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    Stop Recording
                  </Button>
                ) : (
                  <Button disabled size="lg" className="rounded-full px-8 py-6">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Processing...
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Processing indicator */}
      {step === 'processing' && (
        <div className="flex flex-col items-center text-center space-y-6 py-24">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">Saving Exercise Recording</h2>
            <p className="text-slate-500 text-sm">Analyzing speech fluency metrics for {exercise.title}...</p>
          </div>
        </div>
      )}

      {/* Processing error */}
      {step === 'processing_error' && (
        <Card className="border-slate-200 shadow-sm text-center max-w-xl mx-auto">
          <CardContent className="pt-8 pb-8 px-6 space-y-6">
            <div className="mx-auto bg-amber-50 w-16 h-16 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-amber-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">
                {errorMsg === "Audio could not be saved." ? "Audio Could Not Be Saved" : "Analysis Unavailable"}
              </h2>
              <p className="text-slate-600 max-w-sm mx-auto text-sm">
                {errorMsg || "Audio could not be saved."}
              </p>
              {errorMsg !== "Audio could not be saved." && (
                <p className="text-sm text-slate-500">
                  Your exercise recording was securely saved. You can view the results or retry analysis.
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              {errorMsg === "Audio could not be saved." ? (
                <Button 
                  onClick={() => {
                    setStep('ready');
                    setRecordingState('idle');
                    setDuration(0);
                    setErrorMsg(null);
                  }}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Record Again
                </Button>
              ) : (
                <>
                  <Link 
                    to={sessionId ? `/exercises/${exercise.id}/results/${sessionId}` : `/exercises/${exercise.id}`}
                    className="inline-flex h-10 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md items-center justify-center text-sm font-medium transition-colors w-full sm:w-auto"
                  >
                    {sessionId ? "View Exercise Results" : "Back to Exercise"}
                  </Link>
                  <Button 
                    onClick={() => {
                      if (sessionId) {
                        processAudio(sessionId, audioBlobRef.current);
                      }
                    }} 
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Retry Analysis
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
