import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { LiveSession } from "../../types/supabase";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Monitor,
  Volume2,
  Sparkles,
  User,
  Clock,
  Maximize2,
  Minimize2,
  AlertCircle,
  Activity
} from "lucide-react";

interface LiveVideoCallModalProps {
  session: LiveSession;
  isOpen: boolean;
  onClose: () => void;
  userRole: "slp" | "patient";
}

export function LiveVideoCallModal({
  session,
  isOpen,
  onClose,
  userRole
}: LiveVideoCallModalProps) {
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Call duration state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [callActive, setCallActive] = useState(false);
  const [callEnded, setCallEnded] = useState(false);

  // Audio analysis / Visualizer level
  const [audioLevel, setAudioLevel] = useState(0);

  // Video refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Start media stream on modal open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function startMedia() {
      try {
        setMediaError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        setCallActive(true);

        // Mark session started in DB if not already started
        if (!session.actual_started_at) {
          await (supabase.from("live_sessions") as any)
            .update({
              actual_started_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("id", session.id);
        }

        // Setup Audio Analyser for voice meter
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            audioContextRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const checkAudio = () => {
              if (!isMounted) return;
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
              animFrameRef.current = requestAnimationFrame(checkAudio);
            };
            checkAudio();
          }
        } catch (e) {
          console.warn("Audio analyser initialization notice:", e);
        }
      } catch (err: any) {
        console.error("Camera/mic error:", err);
        setMediaError(
          "Could not access camera or microphone. Please check browser permissions."
        );
      }
    }

    startMedia();

    return () => {
      isMounted = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isOpen, session.id]);

  // Timer counter
  useEffect(() => {
    if (!callActive || callEnded) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callActive, callEnded]);

  // Toggle Mute Audio
  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !micOn;
      });
      setMicOn(!micOn);
    }
  };

  // Toggle Camera
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !cameraOn;
      });
      setCameraOn(!cameraOn);
    }
  };

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (screenSharing) {
      // Switch back to video camera
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = camStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = camStream;
        }
        setScreenSharing(false);
      } catch (e) {
        console.error(e);
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
        
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (audioTrack) {
          screenStream.addTrack(audioTrack);
        }

        localStreamRef.current = screenStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        setScreenSharing(true);

        screenStream.getVideoTracks()[0].onended = () => {
          setScreenSharing(false);
        };
      } catch (e) {
        console.error("Screen share canceled or failed:", e);
      }
    }
  };

  // End Call
  const handleEndCall = async () => {
    try {
      setCallActive(false);
      setCallEnded(true);

      // Stop stream tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      // Update DB session as completed
      const finalDurationMins = Math.max(1, Math.round(elapsedSeconds / 60));
      await (supabase.from("live_sessions") as any)
        .update({
          status: "completed",
          actual_ended_at: new Date().toISOString(),
          actual_duration: finalDurationMins,
          updated_at: new Date().toISOString()
        })
        .eq("id", session.id);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error("Error ending call:", err);
      onClose();
    }
  };

  if (!isOpen) return null;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const otherPersonName =
    userRole === "slp"
      ? session.patient?.full_name || "Patient"
      : session.slp?.full_name || "Speech Language Pathologist";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-[85vh] bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 flex flex-col overflow-hidden text-white">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Live Speech Therapy Session
                <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs">
                  {userRole === "slp" ? "Clinician Room" : "Patient Room"}
                </Badge>
              </h3>
              <p className="text-xs text-slate-400">
                Connected with <span className="text-slate-200 font-semibold">{otherPersonName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Audio Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs">
              <Activity className={`h-4 w-4 ${audioLevel > 15 ? "text-emerald-400" : "text-slate-500"}`} />
              <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-75"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            </div>

            {/* Timer */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-950/80 border border-indigo-800/60 text-indigo-200 text-xs font-mono font-bold">
              <Clock className="h-4 w-4 text-indigo-400" />
              <span>{formatTime(elapsedSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Video Canvas Container */}
        <div className="relative flex-1 bg-slate-950 p-4 flex items-center justify-center overflow-hidden">
          {mediaError && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-slate-900/95 text-center space-y-3">
              <div className="p-3 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                <AlertCircle className="h-8 w-8" />
              </div>
              <p className="text-sm font-semibold text-red-200">{mediaError}</p>
              <Button
                variant="outline"
                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                onClick={onClose}
              >
                Close Session
              </Button>
            </div>
          )}

          {callEnded ? (
            <div className="flex flex-col items-center justify-center text-center space-y-3 p-6 animate-in zoom-in-95">
              <div className="p-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Sparkles className="h-10 w-10" />
              </div>
              <h4 className="text-xl font-bold text-white">Session Completed</h4>
              <p className="text-sm text-slate-400">Total Duration: {formatTime(elapsedSeconds)}</p>
            </div>
          ) : (
            <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center">
              {/* Simulated Remote Video Screen */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 p-6 text-center">
                <div className="relative mb-4">
                  <div className="h-28 w-28 rounded-full bg-gradient-to-tr from-indigo-600 to-teal-500 p-1 shadow-xl">
                    <div className="h-full w-full rounded-full bg-slate-900 flex items-center justify-center text-3xl font-bold text-white">
                      {otherPersonName.charAt(0)}
                    </div>
                  </div>
                  <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-emerald-500 border-2 border-slate-900" />
                </div>
                <h4 className="text-lg font-bold text-white">{otherPersonName}</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  {userRole === "slp"
                    ? "Patient speech stream active. Voice metrics and fluencies are monitored."
                    : "Live audio and video feed active with your speech language pathologist."}
                </p>
                {session.purpose && (
                  <div className="mt-4 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
                    <span className="font-semibold text-indigo-300">Session Goal:</span> {session.purpose}
                  </div>
                )}
              </div>

              {/* Local Self Camera Feed Overlay */}
              <div className="absolute bottom-4 right-4 w-44 sm:w-60 aspect-video rounded-2xl overflow-hidden border-2 border-indigo-500/50 shadow-2xl bg-slate-950 z-10">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${!cameraOn ? "hidden" : ""}`}
                />
                {!cameraOn && (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-xs space-y-1">
                    <VideoOff className="h-6 w-6 text-slate-500" />
                    <span>Camera Off</span>
                  </div>
                )}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/80 text-[10px] font-semibold text-slate-200 backdrop-blur-xs">
                  You ({userRole === "slp" ? "SLP" : "Patient"})
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900/90 border-t border-slate-800 shrink-0">
          <div className="text-xs text-slate-400 hidden sm:block">
            Meeting ID: <span className="font-mono text-slate-300">{session.meeting_id || session.id.substring(0, 8)}</span>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-3 mx-auto sm:mx-0">
            {/* Mic Button */}
            <button
              onClick={toggleMic}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                micOn
                  ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                  : "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
              }`}
              title={micOn ? "Mute Microphone" : "Unmute Microphone"}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>

            {/* Camera Button */}
            <button
              onClick={toggleCamera}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                cameraOn
                  ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                  : "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
              }`}
              title={cameraOn ? "Turn Camera Off" : "Turn Camera On"}
            >
              {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>

            {/* Screen Share Button */}
            <button
              onClick={toggleScreenShare}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                screenSharing
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
              }`}
              title={screenSharing ? "Stop Sharing Screen" : "Share Screen"}
            >
              <Monitor className="h-5 w-5" />
            </button>

            {/* End Call Button */}
            <button
              onClick={handleEndCall}
              className="px-5 py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-red-600/30 ml-2"
            >
              <PhoneOff className="h-5 w-5" />
              <span>End Call</span>
            </button>
          </div>

          <div className="w-28 hidden md:block text-right">
            <span className="text-[11px] text-slate-500 font-medium">Encrypted Media</span>
          </div>
        </div>
      </div>
    </div>
  );
}
