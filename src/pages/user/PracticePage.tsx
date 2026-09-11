import { useState, useRef, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Mic, Square, Shield, AlertCircle, CheckCircle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export function PracticePage() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const exerciseId = searchParams.get("exerciseId");
  const navigate = useNavigate();

  const [step, setStep] = useState<'consent' | 'recording' | 'processing' | 'processing_error'>('consent');
  const [consentId, setConsentId] = useState<string | null>(null);
  
  const [recordingState, setRecordingState] = useState<'idle' | 'requesting' | 'recording' | 'stopped' | 'error' | 'denied'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const timerRef = useRef<number | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAgree = async () => {
    try {
      const { data, error } = await (supabase.from('consents') as any).insert({
        user_id: profile!.id,
        consent_type: 'AUDIO_RECORDING_ANALYSIS'
      }).select().single();
      
      if (error) throw error;
      
      setConsentId(data?.id || null);
      setStep('recording');
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to save consent.");
    }
  };

  const handleCancel = () => {
    navigate('/exercises');
  };

  const startRecording = async () => {
    setErrorMsg(null);
    setRecordingState('requesting');
    audioChunksRef.current = [];
    setDuration(0);

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

      mediaRecorder.onstop = () => {
        handleRecordingStop();
      };

      mediaRecorder.start();
      setRecordingState('recording');
      
      timerRef.current = window.setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

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
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setRecordingState('stopped');
    }
  };

  const handleRecordingStop = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    if (audioBlob.size === 0) {
      setRecordingState('error');
      setErrorMsg("Recording was empty.");
      return;
    }
    audioBlobRef.current = audioBlob;
    
    setStep('processing');
    
    try {
      // 1. Create the session in the database
      const { data: sessionData, error: sessionError } = await (supabase.from('sessions') as any).insert({
        user_id: profile!.id,
        exercise_id: exerciseId || null,
        duration: duration,
        review_status: 'NOT_REVIEWED'
      }).select().single();

      if (sessionError) throw sessionError;

      if (consentId && sessionData) {
        await (supabase.from('consents') as any).update({ session_id: sessionData.id }).eq('id', consentId);
      }

      const newSessionId = sessionData?.id;
      setSessionId(newSessionId || null);

      if (newSessionId) {
        await processAudio(newSessionId, audioBlob);
      }
      
    } catch (err: any) {
      console.error(err);
      setRecordingState('error');
      setErrorMsg("Failed to save session data.");
      setStep('recording'); 
    }
  };

  const processAudio = async (currentSessionId: string, audioData: Blob) => {
    setStep('processing');
    setErrorMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const formData = new FormData();
      formData.append('sessionId', currentSessionId);
      formData.append('audio', audioData, 'recording.webm');

      const response = await fetch('/api/analyze-speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to process audio');
      }

      navigate(`/practice/${currentSessionId}`);
    } catch (err: any) {
      console.error('Audio processing error:', err);
      setErrorMsg(err.message || 'Speech analysis is temporarily unavailable.');
      setStep('processing_error');
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
    <div className="max-w-2xl mx-auto py-12 px-4">
      {step === 'consent' && (
        <Card className="border-slate-200 shadow-sm text-center">
          <CardContent className="pt-8 pb-8 px-6 space-y-6">
            <div className="mx-auto bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-indigo-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">Privacy & Consent</h2>
              <p className="text-slate-600 max-w-sm mx-auto">
                Your voice recording will be securely stored to analyze this practice session and may be reviewed by your assigned clinician.
              </p>
            </div>
            {errorMsg && <div className="text-red-500 text-sm">{errorMsg}</div>}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <Button variant="outline" onClick={handleCancel} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleAgree} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white">
                I Agree
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'recording' && (
        <div className="flex flex-col items-center text-center space-y-12 py-12">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Practice Session</h1>
            <p className="text-slate-500">
              {recordingState === 'idle' ? 'Ready to record' : 
               recordingState === 'requesting' ? 'Requesting microphone...' : 
               recordingState === 'recording' ? 'Listening...' : 
               recordingState === 'error' || recordingState === 'denied' ? 'Recording failed' : 'Stopped'}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center">
            <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-colors ${
              recordingState === 'recording' ? 'bg-red-50 text-red-600' : 
              recordingState === 'error' || recordingState === 'denied' ? 'bg-red-50 text-red-600' :
              'bg-slate-100 text-slate-400'
            }`} aria-hidden="true">
              <Mic className="w-12 h-12" />
            </div>
            
            <div className="mt-8 text-5xl font-light text-slate-900 font-mono tracking-tighter" aria-live="polite" aria-atomic="true">
              {formatTime(duration)}
            </div>
          </div>

          {recordingState === 'error' && (
            <div className="flex items-center justify-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-md text-sm mx-auto max-w-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {recordingState === 'denied' && (
            <div className="flex items-center justify-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-md text-sm max-w-sm text-left mx-auto">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>Microphone access was denied. Please allow microphone permissions in your browser settings to continue.</span>
            </div>
          )}

          <div className="pt-4">
            {recordingState === 'idle' || recordingState === 'error' || recordingState === 'denied' ? (
              <Button onClick={startRecording} size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-8" aria-label="Start recording">
                Start Recording
              </Button>
            ) : recordingState === 'recording' ? (
              <Button onClick={stopRecording} size="lg" variant="outline" className="border-red-200 hover:bg-red-50 hover:text-red-700 text-red-600 rounded-full px-8 gap-2" aria-label="Stop recording">
                <Square className="w-4 h-4 fill-current" aria-hidden="true" />
                Stop Practice
              </Button>
            ) : (
              <Button disabled size="lg" className="rounded-full px-8" aria-busy="true">
                Processing...
              </Button>
            )}
          </div>
        </div>
      )}

      {step === 'processing' && (
        <div className="flex flex-col items-center text-center space-y-6 py-24">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">Saving Session</h2>
            <p className="text-slate-500">Preparing your audio for analysis...</p>
          </div>
        </div>
      )}

      {step === 'processing_error' && (
        <Card className="border-slate-200 shadow-sm text-center">
          <CardContent className="pt-8 pb-8 px-6 space-y-6">
            <div className="mx-auto bg-red-50 w-16 h-16 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">Analysis Failed</h2>
              <p className="text-slate-600 max-w-sm mx-auto">
                {errorMsg || "Speech analysis is temporarily unavailable."}
              </p>
              <p className="text-sm text-slate-500">
                Your session was saved successfully. You can retry the analysis or return to your dashboard.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <Link 
                to="/dashboard"
                className="inline-flex h-10 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md items-center justify-center text-sm font-medium transition-colors w-full sm:w-auto"
              >
                Skip Analysis
              </Link>
              <Button 
                onClick={() => {
                  if (sessionId && audioBlobRef.current) {
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
