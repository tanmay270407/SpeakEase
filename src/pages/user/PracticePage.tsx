import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mic, Square, Shield, AlertCircle, Loader2, Sparkles, RefreshCw, Heart, UserCheck, Clock, Target, Volume2, Info } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { formatDuration } from "../../lib/utils";
import { getAuthoritativeAudioDuration } from "../../lib/audioDuration";
import { PracticeContentItem, getRandomPracticeParagraph } from "../../lib/practiceContent";
import { connectionService } from "../../services/connectionService";

export function PracticePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Active connected SLP info
  const [activeSLP, setActiveSLP] = useState<{ full_name: string; professional_title: string | null } | null>(null);

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

  // Web Audio API visualizer refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const [sessionId, setSessionId] = useState<string | null>(null);

  // Load patient's connected SLP and check if consent was already given in this browser session
  useEffect(() => {
    const hasConsentedBefore = sessionStorage.getItem("speakease_practice_consent") === "true";
    if (hasConsentedBefore) {
      setStep('ready');
      loadDynamicPracticeContent();
    }

    async function loadSLP() {
      if (profile?.id) {
        try {
          const res = await connectionService.getPatientActiveSLP(profile.id);
          if (res?.slps) {
            setActiveSLP({
              full_name: res.slps.full_name,
              professional_title: res.slps.professional_title || null,
            });
          }
        } catch (err) {
          console.warn("Could not fetch connected SLP:", err);
        }
      }
    }
    loadSLP();
  }, [profile?.id]);

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

  // User must explicitly click "I Agree".
  const handleAgree = async () => {
    if (!profile?.id) return;
    setIsSubmittingConsent(true);
    setErrorMsg(null);
    try {
      sessionStorage.setItem("speakease_practice_consent", "true");
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

      // Web Audio API for live level visualizer
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
            animFrameRef.current = requestAnimationFrame(updateLevel);
          }
        };
        updateLevel();
      } catch (e) {
        console.warn("Live visualizer Web Audio API setup notice:", e);
      }
      
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
        cleanupAudioContext();
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
      cleanupAudioContext();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setRecordingState('denied');
      } else {
        setRecordingState('error');
        setErrorMsg(err.message || 'Could not access microphone');
      }
    }
  };

  const cleanupAudioContext = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  const stopRecording = () => {
    stopTimeRef.current = Date.now();
    cleanupAudioContext();
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
      let authoritativeDuration = await getAuthoritativeAudioDuration(audioBlob);

      if (authoritativeDuration <= 0 && audioBlob.size > 0) {
        authoritativeDuration = 1;
      }

      setDuration(authoritativeDuration);

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
        processAudio(newSessionId, audioBlob).catch(err => {
          console.warn("Background audio analysis notice:", err);
        });
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
      cleanupAudioContext();
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Estimated practice duration calculation
  const wordCount = practiceContent.paragraph ? practiceContent.paragraph.split(/\s+/).length : 50;
  const estimatedMin = Math.max(1, Math.round(wordCount / 60));

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Clinician Visibility Banner */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs text-indigo-900">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden="true" />
          <span>
            {activeSLP ? (
              <>Connected Clinician: <strong className="font-semibold text-indigo-950">{activeSLP.full_name}</strong>. Your practice session will be stored in your clinical history.</>
            ) : (
              <>Private practice mode. Practice recordings are saved securely in your private session history.</>
            )}
          </span>
        </div>
        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-800 shrink-0">
          {activeSLP ? 'Shared with SLP' : 'Private Mode'}
        </span>
      </div>

      {/* 1. SEPARATE CONSENT SCREEN - Reading paragraph is strictly HIDDEN until explicit "I Agree" */}
      {step === 'consent' && (
        <Card id="practice-consent-card" className="border-slate-200 shadow-sm text-center max-w-xl mx-auto bg-white">
          <CardContent className="pt-8 pb-8 px-6 space-y-6">
            <div className="mx-auto bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center ring-8 ring-indigo-50/40">
              <Shield className="w-8 h-8 text-indigo-600" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900">Practice Privacy & Consent</h2>
              <p className="text-slate-600 max-w-sm mx-auto text-sm leading-relaxed">
                Your voice recording will be securely stored to analyze this practice session and may be reviewed by your assigned clinician.
              </p>
            </div>
            {errorMsg && (
              <div className="text-red-600 text-sm flex items-center justify-center gap-1.5 bg-red-50 p-3 rounded-lg border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={handleCancel} 
                className="w-full sm:w-auto min-h-[44px] px-6 text-sm font-medium"
                id="practice-consent-cancel-btn"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleAgree} 
                disabled={isSubmittingConsent}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold min-h-[44px] px-6 text-sm shadow-sm"
                id="practice-consent-agree-btn"
              >
                {isSubmittingConsent ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
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
        <div id="practice-recording-container" className="space-y-6 animate-in fade-in duration-200">
          {/* Page Title & Supportive Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Speech Practice
            </h1>
            <p className="text-slate-600 text-sm max-w-md mx-auto">
              Read the passage below at your own comfortable pace.
            </p>
          </div>

          {/* Supportive Guidance Callout */}
          <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-4 flex items-start gap-3 text-xs text-emerald-950">
            <Heart className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="font-semibold text-emerald-900 text-sm">Gentle Speech Reminder</p>
              <p className="text-emerald-800 leading-relaxed">
                Take a comfortable, relaxed breath before speaking. Feel free to pause whenever you need and read at whatever tempo feels natural to you. There is no hurry.
              </p>
            </div>
          </div>

          {/* Readable Dynamic Practice Paragraph Card */}
          <Card id="practice-reading-paragraph-card" className="border-slate-200 shadow-sm bg-white overflow-hidden">
            <div className="bg-slate-50/80 px-6 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                  {practiceContent.category || "Practice Passage"}
                </span>
                <span className="flex items-center gap-1 text-slate-500 font-medium">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  ~{estimatedMin}-{estimatedMin + 1} min practice
                </span>
              </div>

              {recordingState === 'idle' && (
                <button
                  onClick={() => setPracticeContent(getRandomPracticeParagraph(practiceContent.id))}
                  disabled={isLoadingContent}
                  className="flex items-center gap-1.5 text-slate-600 hover:text-indigo-600 font-medium transition-colors cursor-pointer min-h-[36px] px-2"
                  title="Change to another passage"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingContent ? 'animate-spin' : ''}`} />
                  <span>New Passage</span>
                </button>
              )}
            </div>

            <CardContent className="p-6 sm:p-8 space-y-4">
              {/* Practice Focus Badge */}
              {practiceContent.targetFocus && (
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-900 bg-indigo-50/80 px-3 py-1 rounded-lg border border-indigo-100">
                  <Target className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Focus: {practiceContent.targetFocus}</span>
                </div>
              )}

              <p className="text-lg sm:text-xl text-slate-900 leading-relaxed font-normal pt-1">
                "{practiceContent.paragraph}"
              </p>
            </CardContent>
          </Card>

          {/* Microphone Icon, Live Level Visualizer, Timer, and Start/Stop Recording */}
          <div className="flex flex-col items-center text-center space-y-5 pt-2">
            <div className="relative flex items-center justify-center">
              <div 
                className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all ${
                  recordingState === 'recording' 
                    ? 'bg-red-50 text-red-600 animate-pulse ring-8 ring-red-100 shadow-md' 
                    : recordingState === 'error' || recordingState === 'denied' 
                    ? 'bg-red-50 text-red-600' 
                    : 'bg-indigo-50 text-indigo-600 ring-4 ring-indigo-50/50'
                }`}
                aria-hidden="true"
              >
                <Mic className="w-9 h-9" />
              </div>
            </div>

            {/* Live Audio Visualizer Equalizer Bars (Active during recording) */}
            {recordingState === 'recording' && (
              <div className="flex items-end justify-center gap-1 h-10 px-4 py-1 bg-slate-50 border border-slate-200 rounded-xl" aria-label="Live audio input visualizer">
                {[...Array(12)].map((_, i) => {
                  const factor = Math.sin((i + 1) * 0.8) * 0.5 + 0.5;
                  const barHeight = Math.max(15, Math.min(100, audioLevel * factor * 1.5));
                  return (
                    <div 
                      key={i}
                      className="w-1.5 bg-indigo-600 rounded-full transition-all duration-75"
                      style={{ height: `${barHeight}%` }}
                    />
                  );
                })}
              </div>
            )}

            {/* Accurate Timer Display */}
            <div 
              className="text-4xl sm:text-5xl font-light text-slate-900 font-mono tracking-tight" 
              aria-live="polite" 
              aria-atomic="true"
              aria-label={`Recording duration: ${formatDuration(duration)}`}
            >
              {formatDuration(duration)}
            </div>

            {/* Current Recording State Description */}
            <p className="text-slate-600 text-sm font-medium" aria-live="polite">
              {recordingState === 'idle' ? 'Ready to record' : 
               recordingState === 'requesting' ? 'Connecting microphone...' : 
               recordingState === 'recording' ? 'Recording in progress — read at your natural pace' : 
               recordingState === 'error' || recordingState === 'denied' ? 'Recording issue encountered' : 'Recording stopped'}
            </p>

            {recordingState === 'error' && (
              <div className="flex items-center justify-center gap-2 text-red-700 bg-red-50 px-4 py-3 rounded-xl text-sm mx-auto max-w-md border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{errorMsg || 'Could not access microphone.'}</span>
              </div>
            )}

            {recordingState === 'denied' && (
              <div className="flex items-start gap-2.5 text-red-700 bg-red-50 px-4 py-3 rounded-xl text-xs max-w-md text-left mx-auto border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-red-900">Microphone Access Needed</p>
                  <p className="mt-0.5 text-red-800">
                    Microphone permission was denied by your browser. Please click the lock/camera icon in your URL bar and allow microphone permissions to continue.
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons with 44px+ Touch Targets */}
            <div className="pt-2">
              {recordingState === 'idle' || recordingState === 'requesting' || recordingState === 'error' || recordingState === 'denied' ? (
                <Button 
                  onClick={startRecording} 
                  disabled={recordingState === 'requesting'}
                  size="lg" 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full min-h-[48px] px-8 py-3 text-base font-semibold shadow-md gap-2 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 cursor-pointer" 
                  aria-label="Start practice recording"
                  id="practice-start-recording-btn"
                >
                  {recordingState === 'requesting' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5" aria-hidden="true" />
                      Start Recording
                    </>
                  )}
                </Button>
              ) : recordingState === 'recording' ? (
                <Button 
                  onClick={stopRecording} 
                  size="lg" 
                  variant="outline" 
                  className="border-2 border-red-500 bg-white hover:bg-red-50 hover:text-red-700 text-red-600 rounded-full min-h-[48px] px-8 py-3 text-base font-bold gap-2 shadow-sm focus:ring-2 focus:ring-offset-2 focus:ring-red-500 cursor-pointer" 
                  aria-label="Stop practice recording"
                  id="practice-stop-recording-btn"
                >
                  <Square className="w-4 h-4 fill-current" aria-hidden="true" />
                  Stop Practice
                </Button>
              ) : (
                <Button disabled size="lg" className="rounded-full min-h-[48px] px-8 py-3" aria-busy="true">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />
                  Processing audio...
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="flex flex-col items-center text-center space-y-6 py-20 animate-in fade-in duration-200">
          <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center ring-8 ring-indigo-50/50">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">Saving Recording</h2>
            <p className="text-slate-500 text-sm">Saving audio to your clinical history record...</p>
          </div>
        </div>
      )}

      {step === 'analyzing' && (
        <div className="flex flex-col items-center text-center space-y-6 py-20 animate-in fade-in duration-200">
          <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center ring-8 ring-indigo-50/50">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">Analyzing your practice session...</h2>
            <p className="text-slate-500 text-sm max-w-md">
              Extracting acoustic parameters and speech metrics to generate supportive clinical feedback.
            </p>
          </div>
        </div>
      )}

      {step === 'processing_error' && (
        <Card className="border-slate-200 shadow-sm text-center max-w-xl mx-auto animate-in fade-in duration-200">
          <CardContent className="pt-8 pb-8 px-6 space-y-6">
            <div className="mx-auto bg-amber-50 w-16 h-16 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-amber-600" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900">
                Speech analysis temporarily unavailable
              </h2>
              <p className="text-slate-600 max-w-sm mx-auto text-sm">
                Your session audio was securely saved to your history. You can view your session or retry analysis now.
              </p>
              {errorMsg && (
                <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 font-mono">
                  {errorMsg}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              {sessionId && (
                <Link 
                  to={`/practice/${sessionId}`}
                  className="inline-flex h-11 px-5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl items-center justify-center text-sm font-semibold transition-colors w-full sm:w-auto"
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
                className="w-full sm:w-auto min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
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
