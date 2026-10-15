import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { LiveSession } from "../../types/supabase";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { useAuth } from "../../contexts/AuthContext";
import { reviewService } from "../../services/reviewService";
import { useWebRTC } from "../../hooks/useWebRTC";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Monitor,
  Clock,
  AlertCircle,
  Activity,
  Star,
  CheckCircle,
  Loader2,
  RefreshCw,
  Radio,
  Sparkles,
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
  userRole,
}: LiveVideoCallModalProps) {
  const { profile } = useAuth();

  // Call timing state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [callEnded, setCallEnded] = useState(false);

  // Post-session rating state for patient
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState<string>("");
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [submittedReview, setSubmittedReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Audio autoplay status
  const [audioAutoplayBlocked, setAudioAutoplayBlocked] = useState<boolean>(false);

  // Refs for guarding DB updates
  const hasUpdatedStartRef = useRef(false);
  const hasUpdatedEndRef = useRef(false);

  // Video and audio element references
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize WebRTC hook
  const {
    localStream,
    remoteStream,
    connectionState,
    iceConnectionState,
    micOn,
    cameraOn,
    screenSharing,
    isPeerJoined,
    isRemoteCameraOff,
    isRemoteMicMuted,
    mediaError,
    authError,
    audioLevel,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    retryMediaAndConnection,
    hangUp,
  } = useWebRTC({
    sessionId: session.id,
    userId: profile?.id,
    userRole,
    isOpen: isOpen && !callEnded,
    onConnected: async () => {
      // Mark session started in DB if not already logged and not already sent
      if (!session.actual_started_at && !hasUpdatedStartRef.current) {
        hasUpdatedStartRef.current = true;
        try {
          await (supabase.from("live_sessions") as any)
            .update({
              actual_started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.id);
        } catch (e) {
          console.warn("Error updating session start time:", e);
        }
      }
    },
  });

  // Unlock remote audio if restricted by browser autoplay policy
  const handleUnlockAudio = async () => {
    if (remoteAudioRef.current) {
      try {
        await remoteAudioRef.current.play();
        setAudioAutoplayBlocked(false);
        console.log("[WebRTC Diagnostic] Remote audio unlocked by user click");
      } catch (err) {
        console.warn("[WebRTC Diagnostic] Audio unlock attempt failed:", err);
      }
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.play().catch(() => {});
    }
  };

  // Attach local media stream to local video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      localVideoRef.current.play().catch((e) => {
        console.warn("[WebRTC Diagnostic] Local video preview play notice:", e);
      });
    }
  }, [localStream]);

  // Attach remote media stream to dedicated audio and video elements
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      if (remoteAudioRef.current.srcObject !== remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
      remoteAudioRef.current
        .play()
        .then(() => {
          setAudioAutoplayBlocked(false);
          console.log("[WebRTC Diagnostic] Remote audio playback active");
        })
        .catch((e) => {
          console.warn("[WebRTC Diagnostic] Remote audio playback restricted by browser autoplay policy:", e);
          setAudioAutoplayBlocked(true);
        });
    }

    if (remoteVideoRef.current && remoteStream) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      remoteVideoRef.current.play().catch((e) => {
        console.warn("[WebRTC Diagnostic] Remote video playback notice:", e);
      });
    }
  }, [remoteStream]);

  // Timer interval running strictly when connectionState === 'connected'
  useEffect(() => {
    if (!isOpen || callEnded || connectionState !== "connected") {
      if (!isOpen || callEnded) {
        setElapsedSeconds(0);
      }
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, callEnded, connectionState]);

  // Handle End Call
  const handleEndCall = async () => {
    try {
      setCallEnded(true);
      await hangUp();

      // Guard duplicate DB updates on session completion
      if (!hasUpdatedEndRef.current) {
        hasUpdatedEndRef.current = true;
        const finalDurationMins = Math.max(1, Math.round(elapsedSeconds / 60));
        await (supabase.from("live_sessions") as any)
          .update({
            status: "completed",
            actual_ended_at: new Date().toISOString(),
            actual_duration: finalDurationMins,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.id);
      }

      if (userRole === "slp") {
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err) {
      console.error("Error ending call:", err);
      onClose();
    }
  };

  // Submit patient SLP review
  const handleReviewSubmit = async () => {
    if (!rating || rating < 1 || rating > 5) {
      setReviewError("Please select a rating from 1 to 5 stars.");
      return;
    }
    if (!profile?.id || !session.slp_id) {
      setReviewError("Unable to identify session details.");
      return;
    }

    try {
      setSubmittingReview(true);
      setReviewError(null);

      const res = await reviewService.submitReview({
        slpId: session.slp_id,
        patientId: profile.id,
        sessionId: session.id,
        rating,
        review: reviewText,
      });

      if (!res.success) {
        setReviewError(res.error || "Failed to submit review.");
      } else {
        setSubmittedReview(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      setReviewError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmittingReview(false);
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
              {connectionState === "connected" ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </>
              ) : connectionState === "reconnecting" ? (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              ) : (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500 animate-pulse"></span>
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Live Speech Therapy Session
                <Badge
                  className={`text-xs ${
                    connectionState === "connected"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : connectionState === "reconnecting"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                      : "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                  }`}
                >
                  {connectionState === "connected"
                    ? "WebRTC Live"
                    : connectionState === "reconnecting"
                    ? "Reconnecting..."
                    : "Connecting Signaling..."}
                </Badge>
              </h3>
              <p className="text-xs text-slate-400">
                Connected with{" "}
                <span className="text-slate-200 font-semibold">
                  {otherPersonName}
                </span>{" "}
                ({userRole === "slp" ? "Patient Room" : "Clinician Room"})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Audio Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs">
              <Activity
                className={`h-4 w-4 ${
                  audioLevel > 15 ? "text-emerald-400" : "text-slate-500"
                }`}
              />
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
          {/* Permission / Authorization Error Overlay */}
          {(mediaError || authError) && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-slate-900/95 text-center space-y-4">
              <div className="p-3.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                <AlertCircle className="h-8 w-8" />
              </div>
              <div className="max-w-md space-y-1">
                <h4 className="text-base font-bold text-red-200">
                  {mediaError
                    ? "Media Device Error"
                    : authError?.includes("Unauthorized")
                    ? "Access Unauthorized"
                    : "Signaling Connection Error"}
                </h4>
                <p className="text-xs text-slate-300">
                  {authError || mediaError}
                </p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={retryMediaAndConnection}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold h-9 px-4 rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Connection
                </Button>
                <Button
                  variant="outline"
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 text-xs h-9 px-4 rounded-xl cursor-pointer"
                  onClick={onClose}
                >
                  Close Session
                </Button>
              </div>
            </div>
          )}

          {callEnded ? (
            userRole === "patient" ? (
              <div className="flex flex-col items-center justify-center max-w-lg w-full mx-auto p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl text-center animate-in zoom-in-95">
                {submittedReview ? (
                  <div className="py-6 space-y-3">
                    <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                    <h4 className="text-xl font-bold text-white">
                      Thank You for Your Feedback!
                    </h4>
                    <p className="text-xs text-slate-400">
                      Your review helps us maintain high quality speech therapy
                      services.
                    </p>
                  </div>
                ) : (
                  <div className="w-full space-y-5 text-left">
                    <div className="text-center space-y-1">
                      <h4 className="text-xl font-bold text-white">
                        How was your session with your SLP?
                      </h4>
                      <p className="text-xs text-slate-400">
                        Rate your live therapy session experience with{" "}
                        <span className="text-indigo-300 font-semibold">
                          {otherPersonName}
                        </span>
                        .
                      </p>
                    </div>

                    {/* Star Selection */}
                    <div className="flex flex-col items-center justify-center gap-2 py-2">
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setRating(star)}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            className="p-1 rounded-lg transition-transform hover:scale-110 focus:outline-hidden cursor-pointer"
                          >
                            <Star
                              className={`w-8 h-8 ${
                                star <= (hoverRating || rating)
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-slate-700 hover:text-slate-500"
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <span className="text-xs font-semibold text-indigo-300 h-4">
                        {(hoverRating || rating) === 5 && "Outstanding Session"}
                        {(hoverRating || rating) === 4 && "Great Experience"}
                        {(hoverRating || rating) === 3 && "Good Session"}
                        {(hoverRating || rating) === 2 && "Okay"}
                        {(hoverRating || rating) === 1 && "Needs Improvement"}
                      </span>
                    </div>

                    {/* Review Text */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-300">
                        Optional Review & Feedback
                      </label>
                      <textarea
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        placeholder="Share details about your session experience..."
                        rows={3}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition-colors resize-none"
                      />
                    </div>

                    {reviewError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                        <span>{reviewError}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={onClose}
                        disabled={submittingReview}
                        className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-medium transition-colors cursor-pointer"
                      >
                        Skip
                      </button>
                      <Button
                        onClick={handleReviewSubmit}
                        disabled={rating === 0 || submittingReview}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-9 px-5 rounded-xl"
                      >
                        {submittingReview ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                            Submitting...
                          </>
                        ) : (
                          "Submit Feedback"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-3 p-6 animate-in zoom-in-95">
                <div className="p-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Sparkles className="h-10 w-10" />
                </div>
                <h4 className="text-xl font-bold text-white">
                  Session Completed
                </h4>
                <p className="text-sm text-slate-400">
                  Total Duration: {formatTime(elapsedSeconds)}
                </p>
              </div>
            )
          ) : (
            <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center">
              {/* Dedicated Hidden Audio Element for Remote Audio (Guarantees uninterrupted audio even if camera turns off) */}
              <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

              {/* Autoplay Restriction Unlock Banner */}
              {audioAutoplayBlocked && (
                <div className="absolute top-4 z-40 px-4 py-2.5 bg-amber-500 text-slate-950 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-semibold animate-pulse">
                  <span>Audio playback restricted by browser policy.</span>
                  <button
                    onClick={handleUnlockAudio}
                    className="bg-slate-900 text-white hover:bg-black text-xs font-bold py-1 px-3 rounded-xl cursor-pointer transition-colors"
                  >
                    Tap to Enable Audio
                  </button>
                </div>
              )}

              {/* Persistently Mounted Remote Video Element */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-200 ${
                  remoteStream && !isRemoteCameraOff ? "opacity-100" : "opacity-0 hidden"
                }`}
              />

              {/* Remote Stream Active Overlays */}
              {remoteStream && !isRemoteCameraOff && (
                <>
                  {isRemoteMicMuted && (
                    <div className="absolute top-4 left-4 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-medium text-amber-300 flex items-center gap-1.5 backdrop-blur-md z-10">
                      <MicOff className="w-3.5 h-3.5 text-amber-400" />
                      <span>{otherPersonName} is muted</span>
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-semibold text-slate-200 backdrop-blur-md z-10">
                    {otherPersonName} ({userRole === "slp" ? "Patient" : "SLP"})
                  </div>
                </>
              )}

              {/* Remote Camera Off Display */}
              {remoteStream && isRemoteCameraOff && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-6 text-center space-y-3">
                  <div className="relative">
                    <div className="h-28 w-28 rounded-full bg-gradient-to-tr from-indigo-600 to-teal-500 p-1 shadow-xl">
                      <div className="h-full w-full rounded-full bg-slate-900 flex items-center justify-center text-3xl font-bold text-white">
                        {otherPersonName.charAt(0)}
                      </div>
                    </div>
                    <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-amber-500 border-2 border-slate-900" />
                  </div>
                  <h4 className="text-lg font-bold text-white">
                    {otherPersonName}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm flex items-center justify-center gap-1.5">
                    <VideoOff className="w-3.5 h-3.5 text-slate-500" />
                    Participant turned off camera (Audio stream active)
                  </p>
                  {isRemoteMicMuted && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs">
                      <MicOff className="w-3 h-3" />
                      <span>Microphone Muted</span>
                    </div>
                  )}
                </div>
              )}

              {/* Waiting For Participant Display */}
              {!remoteStream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 p-6 text-center space-y-4">
                  <div className="relative">
                    <div className="h-28 w-28 rounded-full bg-slate-800/80 border-2 border-indigo-500/30 flex items-center justify-center text-3xl font-bold text-white shadow-xl">
                      {otherPersonName.charAt(0)}
                    </div>
                    <div className="absolute -inset-2 rounded-full border border-indigo-500/30 animate-ping opacity-30" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                      Waiting for {otherPersonName}
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    </h4>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Signaling room active. Connection will establish
                      automatically when {otherPersonName} enters the session.
                    </p>
                  </div>
                  {session.purpose && (
                    <div className="px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300 max-w-sm">
                      <span className="font-semibold text-indigo-300">
                        Session Goal:
                      </span>{" "}
                      {session.purpose}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[11px] text-indigo-300/80 pt-2">
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    <span>
                      ICE State:{" "}
                      <span className="font-mono text-white">
                        {iceConnectionState}
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {/* Local Video Stream Overlay */}
              <div className="absolute bottom-4 right-4 w-44 sm:w-60 aspect-video rounded-2xl overflow-hidden border-2 border-indigo-500/50 shadow-2xl bg-slate-950 z-20">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    !cameraOn ? "hidden" : ""
                  }`}
                />
                {!cameraOn && (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-xs space-y-1">
                    <VideoOff className="h-6 w-6 text-slate-500" />
                    <span>Camera Off</span>
                  </div>
                )}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/80 text-[10px] font-semibold text-slate-200 backdrop-blur-xs flex items-center gap-1">
                  {!micOn && <MicOff className="w-2.5 h-2.5 text-red-400" />}
                  <span>You ({userRole === "slp" ? "SLP" : "Patient"})</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Controls Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900/90 border-t border-slate-800 shrink-0">
          <div className="text-xs text-slate-400 hidden sm:block">
            Meeting ID:{" "}
            <span className="font-mono text-slate-300">
              {session.meeting_id || session.id.substring(0, 8)}
            </span>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-3 mx-auto sm:mx-0">
            {/* Mic Toggle */}
            <button
              onClick={toggleMic}
              disabled={callEnded}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                micOn
                  ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                  : "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
              }`}
              title={micOn ? "Mute Microphone" : "Unmute Microphone"}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>

            {/* Camera Toggle */}
            <button
              onClick={toggleCamera}
              disabled={callEnded}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                cameraOn
                  ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                  : "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
              }`}
              title={cameraOn ? "Turn Camera Off" : "Turn Camera On"}
            >
              {cameraOn ? (
                <Video className="h-5 w-5" />
              ) : (
                <VideoOff className="h-5 w-5" />
              )}
            </button>

            {/* Screen Share Toggle */}
            <button
              onClick={toggleScreenShare}
              disabled={callEnded}
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
              disabled={callEnded}
              className="px-5 py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-red-600/30 ml-2"
            >
              <PhoneOff className="h-5 w-5" />
              <span>End Call</span>
            </button>
          </div>

          <div className="w-28 hidden md:block text-right">
            <span className="text-[11px] text-slate-500 font-medium">
              WebRTC Encrypted
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
