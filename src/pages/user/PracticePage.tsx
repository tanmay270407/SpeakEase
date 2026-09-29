import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mic, Square, Shield, AlertCircle, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { formatDuration } from "../../lib/utils";
import { getAuthoritativeAudioDuration } from "../../lib/audioDuration";
import { PracticeContentItem, getRandomPracticeParagraph } from "../../lib/practiceContent";

export function PracticePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Step state: consent -> ready (consent approved, paragraph shown) -> recording -> saving -> analyzing -> processing_error
  const [step, setStep] = useState<'consent' | 'ready' | 'recording' | 'saving' | 'analyzing' | 'processing_error'>('consent');
  const [consentId, setConsentId] = useState<string | null>(null);
  const [isSubmittingConsent, setIsSubmittingConsent] = useState(false);
  
  // Dynamic practice reading paragraph state
  const [practiceContent, setPracticeContent] = useState<PracticeContentItem>(getRandomPracticeParagraph());
  const [isLoadingContent, setIsLoadingContent] = useState(false);

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

  // Fetch or generate dynamic practice content
  const loadDynamicPracticeContent = async () => {
    setIsLoadingContent(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await fetch('/api/practice/content', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (res.ok) {
          const json = await res.json();
          if (json.content?.paragraph) {
            setPracticeContent(json.content);
            return;
          }
        }
      }
      setPracticeContent(getRandomPracticeParagraph(practiceContent.id));
    } catch (err) {
      console.warn("Falling back to local dynamic practice paragraph:", err);
      setPracticeContent(getRandomPracticeParagraph(practiceContent.id));
    } finally {
      setIsLoadingContent(false);
    }
  };

  // User must explicitly click "I Agree". No automatic approval on load or timeout.
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
      
      // Load dynamic reading content for this session
      await loadDynamicPracticeContent();
      
      // Reveal the practice reading paragraph and show recording controls
      setStep('ready');
      setRecordingState('idle');
    } catch (err: any) {
      console.error("Consent recording error:", err);
      setErrorMsg("Failed to save consent. Please try again.");
    } finally {
      setIsSubmittingConsent(false);
    }
  };

  const handleCancel = () => {
    navigate('/dashboard');
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
    
    setStep('saving');
    setRecordingState('stopped');
    
    try {
      // Calculate authoritative media duration directly from the recorded audio Blob
      let authoritativeDuration = await getAuthoritativeAudioDuration(audioBlob);

      // Safeguard: non-zero recording blob must never be 00:00
      if (authoritativeDuration <= 0 && audioBlob.size > 0) {
        authoritativeDuration = 1;
      }

      setDuration(authoritativeDuration);

      // Create pure Practice session (exercise_id is null)
      const { data: sessionData, error: sessionError } = await (supabase.from('sessions') as any).insert({
        user_id: profile!.id,
        exercise_id: null,
        duration: authoritativeDuration,
        review_status: 'NOT_REVIEWED',
        analysis_status: 'analyzing'
      }).select().single();

      if (sessionError) throw sessionError;

      if (consentId && sessionData) {
        await (supabase.from('consents') as any).update({ session_id: sessionData.id }).eq('id', consentId);
      }

      const newSessionId = sessionData?.id;
      setSessionId(newSessionId || null);

      if (newSessionId) {
        // Automatically start speech analysis in the background without blocking navigation
        processAudio(newSessionId, audioBlob).catch(err => {
          console.warn("Background audio analysis notice:", err);
        });
        // Immediately navigate to results page
        navigate(`/practice/${newSessionId}`);
      }
      
    } catch (err: any) {
      console.error(err);
      setRecordingState('error');
      setErrorMsg(err.message === "Audio could not be saved." ? "Audio could not be saved." : "Failed to save session data.");
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
      console.error('Background audio processing notice:', err);
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

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-8">
      {/* 1. SEPARATE CONSENT SCREEN - Reading paragraph is strictly HIDDEN until explicit "I Agree" */}
      {step === 'consent' && (
        <Card id="practice-consent-card" className="border-slate-200 shadow-sm text-center max-w-xl mx-auto bg-white">
          <CardContent className="pt-8 pb-8 px-6 space-y-6">
            <div className="mx-auto bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-indigo-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">Practice Privacy & Consent</h2>
              <p className="text-slate-600 max-w-sm mx-auto text-sm leading-relaxed">
                Your voice recording will be securely stored to analyze this practice session and may be reviewed by your assigned clinician.
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
                id="practice-consent-cancel-btn"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleAgree} 
                disabled={isSubmittingConsent}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                id="practice-consent-agree-btn"
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

      {/* 2. PRACTICE RECORDING SCREEN - Shown ONLY after user explicitly clicks "I Agree" */}
      {(step === 'ready' || step === 'recording') && (
        <div id="practice-recording-container" className="space-y-8 animate-in fade-in duration-200">
          {/* Page Title & Instruction */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Practice Session
            </h1>
            <p className="text-slate-600 text-base">
              Read the paragraph below aloud at your natural pace.
            </p>
          </div>

          {/* One Readable Dynamic Practice Paragraph - strictly hidden before consent */}
          <Card id="practice-reading-paragraph-card" className="border-slate-200 shadow-sm bg-white">
            <CardContent className="p-8 sm:p-10 text-center space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100">
                <span className="font-medium text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">
                  {practiceContent.category || "Practice Passage"}
                </span>
                {recordingState === 'idle' && (
                  <button
                    onClick={() => setPracticeContent(getRandomPracticeParagraph(practiceContent.id))}
                    disabled={isLoadingContent}
                    className="flex items-center gap-1 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
                    title="Change passage"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingContent ? 'animate-spin' : ''}`} />
                    <span>New Passage</span>
                  </button>
                )}
              </div>
              <p className="text-xl sm:text-2xl text-slate-800 leading-relaxed font-normal">
                "{practiceContent.paragraph}"
              </p>
            </CardContent>
          </Card>

          {/* Microphone Icon, Real Recording Timer, and Start/Stop Recording Button */}
          <div className="flex flex-col items-center text-center space-y-6 pt-2">
            <div 
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                recordingState === 'recording' 
                  ? 'bg-red-50 text-red-600 animate-pulse ring-8 ring-red-100' 
                  : recordingState === 'error' || recordingState === 'denied' 
                  ? 'bg-red-50 text-red-600' 
                  : 'bg-slate-100 text-slate-500'
              }`}
              aria-hidden="true"
            >
              <Mic className="w-10 h-10" />
            </div>

            {/* Real Recording Timer */}
            <div 
              className="text-4xl sm:text-5xl font-light text-slate-900 font-mono tracking-tight" 
              aria-live="polite" 
              aria-atomic="true"
            >
              {formatDuration(duration)}
            </div>

            <p className="text-slate-500 text-sm">
              {recordingState === 'idle' ? 'Ready to record' : 
               recordingState === 'requesting' ? 'Requesting microphone...' : 
               recordingState === 'recording' ? 'Listening... Read the paragraph aloud' : 
               recordingState === 'error' || recordingState === 'denied' ? 'Recording failed' : 'Stopped'}
            </p>

            {recordingState === 'error' && (
              <div className="flex items-center justify-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-md text-sm mx-auto max-w-md">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {recordingState === 'denied' && (
              <div className="flex items-center justify-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-md text-sm max-w-md text-left mx-auto">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>Microphone access was denied. Please allow microphone permissions in your browser settings to continue.</span>
              </div>
            )}

            <div>
              {recordingState === 'idle' || recordingState === 'error' || recordingState === 'denied' ? (
                <Button 
                  onClick={startRecording} 
                  size="lg" 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-8 py-6 text-base font-semibold shadow-sm gap-2" 
                  aria-label="Start recording"
                  id="practice-start-recording-btn"
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
                  aria-label="Stop recording"
                  id="practice-stop-recording-btn"
                >
                  <Square className="w-4 h-4 fill-current" aria-hidden="true" />
                  Stop Practice
                </Button>
              ) : (
                <Button disabled size="lg" className="rounded-full px-8 py-6" aria-busy="true">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Processing...
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="flex flex-col items-center text-center space-y-6 py-24 animate-in fade-in duration-200">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">Saving Practice Recording</h2>
            <p className="text-slate-500 text-sm">Saving audio to your clinical record...</p>
          </div>
        </div>
      )}

      {step === 'analyzing' && (
        <div className="flex flex-col items-center text-center space-y-6 py-24 animate-in fade-in duration-200">
          <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center ring-8 ring-indigo-50/50">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">Analyzing your practice session...</h2>
            <p className="text-slate-500 text-sm max-w-md">
              Extracting speech metrics, acoustic parameters, and generating clinical observations.
            </p>
          </div>
        </div>
      )}

      {step === 'processing_error' && (
        <Card className="border-slate-200 shadow-sm text-center max-w-xl mx-auto animate-in fade-in duration-200">
          <CardContent className="pt-8 pb-8 px-6 space-y-6">
            <div className="mx-auto bg-amber-50 w-16 h-16 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-amber-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">
                Practice level unavailable
              </h2>
              <p className="text-slate-600 max-w-sm mx-auto text-sm">
                Your session audio was securely saved. You can view the session or retry analysis now.
              </p>
              {errorMsg && (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                  {errorMsg}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              {sessionId && (
                <Link 
                  to={`/practice/${sessionId}`}
                  className="inline-flex h-10 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md items-center justify-center text-sm font-medium transition-colors w-full sm:w-auto"
                >
                  View Saved Session
                </Link>
              )}
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
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

