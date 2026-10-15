import { useState, useEffect, useRef, useCallback } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getRTCConfiguration } from "../lib/webrtcConfig";

export type WebRTCConnectionState =
  | "idle"
  | "authorizing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "closed";

interface UseWebRTCOptions {
  sessionId: string;
  userId: string | undefined;
  userRole: "slp" | "patient";
  isOpen: boolean;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function useWebRTC({
  sessionId,
  userId,
  userRole,
  isOpen,
  onConnected,
  onDisconnected,
}: UseWebRTCOptions) {
  // Media streams & connection states
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] =
    useState<WebRTCConnectionState>("idle");
  const [iceConnectionState, setIceConnectionState] =
    useState<RTCIceConnectionState | "idle">("idle");

  // Local control toggles
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  // Peer metadata states
  const [isPeerJoined, setIsPeerJoined] = useState(false);
  const [isRemoteCameraOff, setIsRemoteCameraOff] = useState(false);
  const [isRemoteMicMuted, setIsRemoteMicMuted] = useState(false);

  // Error handling
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Audio level meter
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs for persistent instances & state sync
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const iceCandidatesBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const isSettingRemoteRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const initCountRef = useRef<number>(0);

  // Sync mic/camera states to refs
  const micOnRef = useRef(micOn);
  micOnRef.current = micOn;
  const cameraOnRef = useRef(cameraOn);
  cameraOnRef.current = cameraOn;

  // Helper to resume audio context on user interaction
  const resumeAudioContext = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch((e) => {
        console.warn("[WebRTC Diagnostic] AudioContext resume notice:", e);
      });
    }
  }, []);

  // Verify patient-SLP session authorization before joining room
  const verifyAuthorization = useCallback(async (): Promise<boolean> => {
    if (!userId || !sessionId) return false;

    try {
      setConnectionState("authorizing");
      console.log(`[WebRTC Diagnostic] Verifying authorization for userId=${userId}, role=${userRole}, sessionId=${sessionId}`);

      const { data: sessionData, error: sessionErr } = await (
        supabase.from("live_sessions") as any
      )
        .select("id, patient_id, slp_id, status")
        .eq("id", sessionId)
        .maybeSingle();

      if (sessionErr || !sessionData) {
        console.warn("[WebRTC Diagnostic] Session lookup error or not found:", sessionErr);
        setAuthError("Session not found or invalid session ID.");
        return false;
      }

      // Role authorization
      if (userRole === "patient") {
        if (sessionData.patient_id !== userId) {
          console.warn("[WebRTC Diagnostic] Patient user ID does not match session patient_id");
          setAuthError(
            "Unauthorized: You are not the assigned patient for this session."
          );
          return false;
        }
      } else if (userRole === "slp") {
        const { data: slpData } = await (supabase.from("slps") as any)
          .select("id, user_id")
          .eq("id", sessionData.slp_id)
          .maybeSingle();

        const slpMatches =
          (slpData && slpData.user_id === userId) || sessionData.slp_id === userId;

        if (!slpMatches) {
          console.warn("[WebRTC Diagnostic] SLP user ID does not match session slp_id");
          setAuthError(
            "Unauthorized: You are not the assigned SLP for this session."
          );
          return false;
        }
      }

      if (
        sessionData.status === "cancelled" ||
        sessionData.status === "rejected"
      ) {
        console.warn(`[WebRTC Diagnostic] Session status is ${sessionData.status}`);
        setAuthError(`This session has been ${sessionData.status}.`);
        return false;
      }

      // Confirm patient-SLP active assignment status if an assignment record exists
      if (sessionData.patient_id && sessionData.slp_id) {
        const { data: paData } = await (
          supabase.from("patient_assignments") as any
        )
          .select("status")
          .eq("patient_id", sessionData.patient_id)
          .eq("slp_id", sessionData.slp_id)
          .maybeSingle();

        if (paData && paData.status !== "ACTIVE") {
          console.warn("[WebRTC Diagnostic] Patient assignment is not ACTIVE:", paData?.status);
          setAuthError(
            "Unauthorized: Patient and SLP assignment is not active."
          );
          return false;
        }
      }

      console.log(`[WebRTC Diagnostic] Authorization check succeeded. Role=${userRole}, SessionStatus=${sessionData.status}`);
      setAuthError(null);
      return true;
    } catch (err: any) {
      console.error("[WebRTC Diagnostic] Authorization check exception:", err);
      setAuthError("Error checking session authorization.");
      return false;
    }
  }, [sessionId, userId, userRole]);

  // Clean up WebRTC peer connection
  const cleanupPeerConnection = useCallback(() => {
    if (pcRef.current) {
      console.log("[WebRTC Diagnostic] Cleaning up peer connection");
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  // Clean up local media tracks and audio context
  const cleanupLocalMedia = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setAudioLevel(0);
    setScreenSharing(false);
  }, []);

  // Flush buffered ICE candidates after setting remote description
  const flushIceCandidates = async (pc: RTCPeerConnection) => {
    const count = iceCandidatesBufferRef.current.length;
    if (count > 0) {
      console.log(`[WebRTC Diagnostic] Flushing ${count} buffered ICE candidate(s)`);
    }
    while (iceCandidatesBufferRef.current.length > 0) {
      const candidate = iceCandidatesBufferRef.current.shift();
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("[WebRTC Diagnostic] Error adding buffered ICE candidate:", e);
        }
      }
    }
  };

  // Create WebRTC peer connection instance
  const createPeerConnection = useCallback(
    (channel: RealtimeChannel): RTCPeerConnection => {
      cleanupPeerConnection();

      console.log("[WebRTC Diagnostic] Creating RTCPeerConnection instance");
      const config = getRTCConfiguration();
      const pc = new RTCPeerConnection(config);
      pcRef.current = pc;

      // Attach local stream tracks to PeerConnection
      let hasAudioSender = false;
      let hasVideoSender = false;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          console.log(`[WebRTC Diagnostic] Adding local track (${track.kind}, id=${track.id}, readyState=${track.readyState}, enabled=${track.enabled}) to RTCPeerConnection`);
          pc.addTrack(track, localStreamRef.current!);
          if (track.kind === "audio") hasAudioSender = true;
          if (track.kind === "video") hasVideoSender = true;
        });
      }

      // Ensure transceivers exist for both audio and video to guarantee bidirectional SDP negotiation
      if (!hasAudioSender) {
        console.log("[WebRTC Diagnostic] Adding audio transceiver (recvonly) as fallback");
        pc.addTransceiver("audio", { direction: "sendrecv" });
      }
      if (!hasVideoSender) {
        console.log("[WebRTC Diagnostic] Adding video transceiver (recvonly) as fallback");
        pc.addTransceiver("video", { direction: "sendrecv" });
      }

      // Handle local ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
          console.log(`[WebRTC Diagnostic] Generated local ICE candidate (${event.candidate.type || "candidate"}), broadcasting`);
          channelRef.current.send({
            type: "broadcast",
            event: "ice-candidate",
            payload: {
              candidate: event.candidate.toJSON(),
              senderId: userId,
            },
          });
        }
      };

      // Handle incoming remote media tracks
      pc.ontrack = (event) => {
        console.log(`[WebRTC Diagnostic] ontrack received: kind=${event.track.kind}, id=${event.track.id}, readyState=${event.track.readyState}`);
        
        let stream = event.streams && event.streams[0];
        if (!stream) {
          if (!remoteStreamRef.current) {
            remoteStreamRef.current = new MediaStream();
          }
          remoteStreamRef.current.addTrack(event.track);
          stream = remoteStreamRef.current;
        } else {
          remoteStreamRef.current = stream;
        }

        // Fresh MediaStream instance so React state change triggers re-renders and attaches tracks
        const freshStream = new MediaStream(stream.getTracks());
        setRemoteStream(freshStream);

        // Listen for track active/unmute state
        event.track.onunmute = () => {
          console.log(`[WebRTC Diagnostic] Remote track unmuted (media flowing): ${event.track.kind}`);
          if (remoteStreamRef.current) {
            setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
          }
        };

        event.track.onmute = () => {
          console.log(`[WebRTC Diagnostic] Remote track muted: ${event.track.kind}`);
        };

        event.track.onended = () => {
          console.log(`[WebRTC Diagnostic] Remote track ended: ${event.track.kind}`);
          if (remoteStreamRef.current) {
            setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
          }
        };
      };

      // Handle ICE connection state changes & ICE Restart
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`[WebRTC Diagnostic] ICE connection state changed: ${state}`);
        setIceConnectionState(state);

        if (state === "connected" || state === "completed") {
          setConnectionState("connected");
          reconnectAttemptsRef.current = 0;
          if (onConnected) onConnected();
        } else if (state === "disconnected") {
          setConnectionState("reconnecting");
          if (onDisconnected) onDisconnected();
        } else if (state === "failed") {
          if (reconnectAttemptsRef.current < 3) {
            reconnectAttemptsRef.current += 1;
            console.log(`[WebRTC Diagnostic] ICE failed, attempting ICE restart (attempt ${reconnectAttemptsRef.current})`);
            setConnectionState("reconnecting");

            (async () => {
              try {
                pc.restartIce();
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);

                if (channelRef.current) {
                  channelRef.current.send({
                    type: "broadcast",
                    event: "sdp-offer",
                    payload: {
                      sdp: offer,
                      senderId: userId,
                      isIceRestart: true,
                    },
                  });
                }
              } catch (err) {
                console.error("[WebRTC Diagnostic] Error generating ICE restart offer:", err);
              }
            })();
          } else {
            setConnectionState("failed");
            setAuthError(
              "Connection lost and unable to reconnect automatically. Please check your network and click Retry Connection."
            );
          }
        } else if (state === "closed") {
          setConnectionState("closed");
        }
      };

      // Connection state changes
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC Diagnostic] Peer connection state changed: ${pc.connectionState}`);
        if (pc.connectionState === "connected") {
          setConnectionState("connected");
        } else if (pc.connectionState === "failed") {
          setConnectionState("failed");
          setAuthError(
            "Peer connection state failed. Please click Retry Connection."
          );
        }
      };

      return pc;
    },
    [cleanupPeerConnection, onConnected, onDisconnected, userId]
  );

  // Initialize WebRTC session
  const initializeWebRTC = useCallback(async () => {
    if (!isOpen || !userId || !sessionId) return;

    const currentInitId = ++initCountRef.current;
    console.log(`[WebRTC Diagnostic] Initializing WebRTC session #${currentInitId} for sessionId=${sessionId}, userRole=${userRole}`);

    // Clean up any existing channel or media before fresh init
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    cleanupPeerConnection();
    cleanupLocalMedia();

    setMediaError(null);

    // 1. Authorization check
    const isAuthorized = await verifyAuthorization();
    if (!isAuthorized) {
      if (currentInitId === initCountRef.current) {
        setConnectionState("failed");
      }
      return;
    }

    if (currentInitId !== initCountRef.current) return;

    // 2. Check Browser Media Device Support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("[WebRTC Diagnostic] navigator.mediaDevices.getUserMedia is unsupported or insecure context");
      setMediaError(
        "Camera and microphone access requires a secure context (HTTPS) or is not supported by your browser."
      );
      setConnectionState("failed");
      return;
    }

    // 3. Acquire local audio/video media with graceful fallback
    let stream: MediaStream | null = null;
    try {
      console.log("[WebRTC Diagnostic] Requesting local camera and microphone permissions");
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (primaryErr: any) {
      console.warn("[WebRTC Diagnostic] Initial getUserMedia({video, audio}) failed, testing fallback:", primaryErr);

      if (primaryErr.name === "NotAllowedError" || primaryErr.name === "PermissionDeniedError") {
        setMediaError(
          "Camera and microphone permissions were denied. Please grant permission in your browser address bar and click Retry Connection."
        );
        setConnectionState("failed");
        return;
      } else if (primaryErr.name === "NotReadableError" || primaryErr.name === "TrackStartError") {
        setMediaError(
          "Camera or microphone is already in use by another application. Please close other video apps and click Retry Connection."
        );
        setConnectionState("failed");
        return;
      }

      // Try audio-only fallback if video hardware was missing or overconstrained
      try {
        console.log("[WebRTC Diagnostic] Attempting audio-only getUserMedia fallback");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        setCameraOn(false);
        cameraOnRef.current = false;
      } catch (audioErr: any) {
        console.error("[WebRTC Diagnostic] Audio fallback also failed:", audioErr);
        if (audioErr.name === "NotFoundError" || primaryErr.name === "NotFoundError") {
          setMediaError("No microphone or camera devices were found on your computer or phone.");
        } else {
          setMediaError("Unable to access audio or video input devices. Please check browser permissions.");
        }
        setConnectionState("failed");
        return;
      }
    }

    if (currentInitId !== initCountRef.current || !stream) {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      return;
    }

    // Diagnostic logging for local media tracks
    stream.getTracks().forEach((track) => {
      console.log(`[WebRTC Diagnostic] Local media track acquired: kind=${track.kind}, label=${track.label}, id=${track.id}, enabled=${track.enabled}`);
      track.onended = () => {
        if (currentInitId === initCountRef.current) {
          console.warn(`[WebRTC Diagnostic] Local media track ended unexpectedly: ${track.kind}`);
          setMediaError(`Your ${track.kind === "video" ? "camera" : "microphone"} was disconnected or turned off.`);
        }
      };
    });

    localStreamRef.current = stream;
    cameraStreamRef.current = stream;
    setLocalStream(stream);

    // 4. Web Audio API analyzer setup for live microphone meter
    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        if (ctx.state === "suspended") {
          ctx.resume().catch((e) => console.warn("[WebRTC Diagnostic] AudioContext resume notice:", e));
        }

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkAudio = () => {
          if (currentInitId !== initCountRef.current) return;
          if (!micOnRef.current) {
            setAudioLevel(0);
          } else {
            if (ctx.state === "suspended") {
              ctx.resume().catch(() => {});
            }
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
          }
          animFrameRef.current = requestAnimationFrame(checkAudio);
        };
        checkAudio();
      }
    } catch (e) {
      console.warn("[WebRTC Diagnostic] AudioContext setup notice:", e);
    }

    if (currentInitId !== initCountRef.current) return;

    setConnectionState("connecting");

    // 5. Setup private Supabase Realtime channel for signaling
    const channelName = `room:${sessionId}`;
    console.log(`[WebRTC Diagnostic] Subscribing to private Supabase Realtime channel: ${channelName}`);

    const channel = supabase.channel(channelName, {
      config: {
        private: true,
        broadcast: { ack: false, self: false },
      },
    });

    channelRef.current = channel;

    // Create RTCPeerConnection instance
    const pc = createPeerConnection(channel);

    // Helper: Initiates SDP offer if designated offerer (Patient)
    const checkAndInitiateOffer = async (triggerReason: string) => {
      if (currentInitId !== initCountRef.current) return;
      if (!pcRef.current || !channelRef.current) return;
      const currentPc = pcRef.current;

      const isOfferer = userRole === "patient";

      if (!isOfferer) {
        console.log(`[WebRTC Diagnostic] Non-offerer (${userRole}) waiting for offer. Trigger: ${triggerReason}`);
        return;
      }

      if (currentPc.signalingState === "stable" && !currentPc.remoteDescription) {
        try {
          console.log(`[WebRTC Diagnostic] Offerer (${userRole}) initiating SDP offer. Trigger: ${triggerReason}`);
          const offer = await currentPc.createOffer();
          await currentPc.setLocalDescription(offer);
          console.log("[WebRTC Diagnostic] Local description (offer) set, broadcasting sdp-offer");

          channelRef.current.send({
            type: "broadcast",
            event: "sdp-offer",
            payload: {
              sdp: offer,
              senderId: userId,
            },
          });
        } catch (e) {
          console.error("[WebRTC Diagnostic] Error creating SDP offer:", e);
        }
      } else if (currentPc.signalingState === "have-local-offer") {
        console.log(`[WebRTC Diagnostic] Offerer already has local offer pending, re-broadcasting to peer (Trigger: ${triggerReason})`);
        if (currentPc.localDescription) {
          channelRef.current.send({
            type: "broadcast",
            event: "sdp-offer",
            payload: {
              sdp: currentPc.localDescription,
              senderId: userId,
            },
          });
        }
      }
    };

    // Listen for signaling events
    channel
      .on("broadcast", { event: "participant-joined" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userId) return;

        console.log(`[WebRTC Diagnostic] Received participant-joined from remote senderId: ${payload.payload?.senderId}`);
        setIsPeerJoined(true);

        // Immediately respond with local presence/state so joining peer gets immediate confirmation
        if (channelRef.current) {
          console.log("[WebRTC Diagnostic] Responding to participant-joined with peer-state-changed");
          channelRef.current.send({
            type: "broadcast",
            event: "peer-state-changed",
            payload: {
              senderId: userId,
              micOn: micOnRef.current,
              cameraOn: cameraOnRef.current,
            },
          });
        }

        await checkAndInitiateOffer("participant-joined received");
      })
      .on("broadcast", { event: "sdp-offer" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userId) return;

        console.log(`[WebRTC Diagnostic] Received sdp-offer from remote senderId: ${payload.payload?.senderId}`);
        setIsPeerJoined(true);

        try {
          isSettingRemoteRef.current = true;
          const offerSdp = payload.payload?.sdp;

          // Glare handling if receiving concurrent offer
          if (pc.signalingState === "have-local-offer") {
            if (userRole === "slp") {
              console.log("[WebRTC Diagnostic] Offer collision detected. Polite peer (SLP) rolling back local offer");
              await pc.setLocalDescription({ type: "rollback" });
            } else {
              console.log("[WebRTC Diagnostic] Offer collision detected. Impolite peer (Patient) ignoring incoming offer");
              return;
            }
          }

          await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
          console.log("[WebRTC Diagnostic] Remote description set (offer)");
          await flushIceCandidates(pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log("[WebRTC Diagnostic] Local description set (answer), broadcasting sdp-answer");

          if (channelRef.current) {
            channelRef.current.send({
              type: "broadcast",
              event: "sdp-answer",
              payload: {
                sdp: answer,
                senderId: userId,
              },
            });
          }
        } catch (e) {
          console.error("[WebRTC Diagnostic] Error handling SDP offer:", e);
        } finally {
          isSettingRemoteRef.current = false;
        }
      })
      .on("broadcast", { event: "sdp-answer" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userId) return;

        console.log(`[WebRTC Diagnostic] Received sdp-answer from remote senderId: ${payload.payload?.senderId}`);
        try {
          const answerSdp = payload.payload?.sdp;
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
            console.log("[WebRTC Diagnostic] Remote description set (answer)");
            await flushIceCandidates(pc);
          }
        } catch (e) {
          console.error("[WebRTC Diagnostic] Error handling SDP answer:", e);
        }
      })
      .on("broadcast", { event: "ice-candidate" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userId) return;

        const candidateInit = payload.payload?.candidate;
        if (!candidateInit) return;

        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
            console.log("[WebRTC Diagnostic] Remote ICE candidate added");
          } catch (e) {
            console.warn("[WebRTC Diagnostic] Error adding ICE candidate:", e);
          }
        } else {
          console.log("[WebRTC Diagnostic] Buffering remote ICE candidate until remote description set");
          iceCandidatesBufferRef.current.push(candidateInit);
        }
      })
      .on("broadcast", { event: "peer-state-changed" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userId) return;

        console.log(`[WebRTC Diagnostic] Received peer-state-changed: micOn=${payload.payload?.micOn}, cameraOn=${payload.payload?.cameraOn}`);
        setIsPeerJoined(true);
        if (typeof payload.payload?.cameraOn === "boolean") {
          setIsRemoteCameraOff(!payload.payload.cameraOn);
        }
        if (typeof payload.payload?.micOn === "boolean") {
          setIsRemoteMicMuted(!payload.payload.micOn);
        }

        await checkAndInitiateOffer("peer-state-changed received");
      })
      .on("broadcast", { event: "participant-left" }, (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userId) return;

        console.log("[WebRTC Diagnostic] Received participant-left");
        setIsPeerJoined(false);
        setRemoteStream(null);
        setConnectionState("connecting");
      })
      .subscribe((status, err) => {
        if (currentInitId !== initCountRef.current) return;
        console.log(`[WebRTC Diagnostic] Private Realtime channel subscription status: ${status}`);

        if (status === "SUBSCRIBED") {
          console.log("[WebRTC Diagnostic] Channel SUBSCRIBED. Announcing presence and state");
          channel.send({
            type: "broadcast",
            event: "participant-joined",
            payload: {
              senderId: userId,
              userRole,
            },
          });

          channel.send({
            type: "broadcast",
            event: "peer-state-changed",
            payload: {
              senderId: userId,
              micOn: micOnRef.current,
              cameraOn: cameraOnRef.current,
            },
          });
        } else if (status === "CHANNEL_ERROR") {
          console.error("[WebRTC Diagnostic] Supabase Realtime channel error:", err);
          cleanupPeerConnection();
          setConnectionState("failed");
          setAuthError((prev) =>
            prev ||
            "Signaling channel connection failed. Private room access rejected or unauthorized."
          );
        } else if (status === "TIMED_OUT") {
          console.warn("[WebRTC Diagnostic] Supabase Realtime channel subscription timed out.");
          cleanupPeerConnection();
          setConnectionState("failed");
          setAuthError((prev) =>
            prev ||
            "Signaling connection timed out. Please check your network connection and retry."
          );
        } else if (status === "CLOSED") {
          console.log("[WebRTC Diagnostic] Realtime channel closed.");
          if (channelRef.current === channel) {
            channelRef.current = null;
          }
          setConnectionState((prev) =>
            prev === "connected" || prev === "connecting" || prev === "reconnecting"
              ? "closed"
              : prev
          );
        }
      });
  }, [
    isOpen,
    userId,
    sessionId,
    userRole,
    verifyAuthorization,
    createPeerConnection,
    cleanupPeerConnection,
    cleanupLocalMedia,
  ]);

  // Handle open / close lifecycle
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (channelRef.current) {
        try {
          channelRef.current.send({
            type: "broadcast",
            event: "participant-left",
            payload: { senderId: userId },
          });
        } catch (e) {
          // ignore
        }
      }
    };

    if (isOpen) {
      window.addEventListener("beforeunload", handleBeforeUnload);
      window.addEventListener("click", resumeAudioContext);
      initializeWebRTC();
    } else {
      initCountRef.current++;
      if (channelRef.current) {
        try {
          channelRef.current.send({
            type: "broadcast",
            event: "participant-left",
            payload: { senderId: userId },
          });
        } catch (e) {
          // ignore
        }
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      cleanupPeerConnection();
      cleanupLocalMedia();
      setConnectionState("idle");
      setIceConnectionState("idle");
      setIsPeerJoined(false);
      setAuthError(null);
      setMediaError(null);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("click", resumeAudioContext);
      initCountRef.current++;
      if (channelRef.current) {
        try {
          channelRef.current.send({
            type: "broadcast",
            event: "participant-left",
            payload: { senderId: userId },
          });
        } catch (e) {
          // ignore
        }
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      cleanupPeerConnection();
      cleanupLocalMedia();
    };
  }, [isOpen, initializeWebRTC, cleanupPeerConnection, cleanupLocalMedia, userId, resumeAudioContext]);

  // Toggle Mute Audio
  const toggleMic = useCallback(() => {
    resumeAudioContext();
    const newMicState = !micOn;

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = newMicState;
        console.log(`[WebRTC Diagnostic] Local audio track enabled set to: ${newMicState}`);
      });
    }

    if (cameraStreamRef.current && cameraStreamRef.current !== localStreamRef.current) {
      cameraStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = newMicState;
      });
    }

    if (!newMicState) {
      setAudioLevel(0);
    }

    setMicOn(newMicState);
    micOnRef.current = newMicState;

    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "peer-state-changed",
        payload: {
          senderId: userId,
          micOn: newMicState,
          cameraOn: cameraOnRef.current,
        },
      });
    }
  }, [micOn, userId, resumeAudioContext]);

  // Toggle Camera
  const toggleCamera = useCallback(async () => {
    resumeAudioContext();
    const newCameraState = !cameraOn;

    // If camera track has ended and user turns camera on, re-acquire track
    let activeCamTrack = cameraStreamRef.current?.getVideoTracks()[0];
    if (newCameraState && (!activeCamTrack || activeCamTrack.readyState === "ended")) {
      try {
        console.log("[WebRTC Diagnostic] Camera track ended or missing; re-requesting getUserMedia for video");
        const freshCamStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        activeCamTrack = freshCamStream.getVideoTracks()[0];
        if (cameraStreamRef.current) {
          const oldTrack = cameraStreamRef.current.getVideoTracks()[0];
          if (oldTrack) cameraStreamRef.current.removeTrack(oldTrack);
          cameraStreamRef.current.addTrack(activeCamTrack);
        } else {
          cameraStreamRef.current = freshCamStream;
        }

        // Replace track on RTCPeerConnection sender if not screen sharing
        if (!screenSharing && pcRef.current) {
          const videoSender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
          if (videoSender) {
            await videoSender.replaceTrack(activeCamTrack);
          }
        }
      } catch (err) {
        console.error("[WebRTC Diagnostic] Error re-acquiring camera track:", err);
      }
    }

    if (activeCamTrack) {
      activeCamTrack.enabled = newCameraState;
      console.log(`[WebRTC Diagnostic] Local video track enabled set to: ${newCameraState}`);
    }

    // If not currently screen sharing, update localStreamRef video track
    if (!screenSharing && localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = newCameraState;
      });
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    }

    setCameraOn(newCameraState);
    cameraOnRef.current = newCameraState;

    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "peer-state-changed",
        payload: {
          senderId: userId,
          micOn: micOnRef.current,
          cameraOn: newCameraState,
        },
      });
    }
  }, [cameraOn, screenSharing, userId, resumeAudioContext]);

  // Stop Screen Share helper
  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    setScreenSharing(false);

    // Restore camera video track on peer connection
    let camTrack = cameraStreamRef.current?.getVideoTracks()[0];

    // If camera track ended, re-acquire it
    if (!camTrack || camTrack.readyState === "ended") {
      try {
        const freshStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        camTrack = freshStream.getVideoTracks()[0];
        if (cameraStreamRef.current) {
          cameraStreamRef.current = freshStream;
        }
      } catch (e) {
        console.warn("[WebRTC Diagnostic] Could not restore camera video after screen share:", e);
      }
    }

    if (camTrack && pcRef.current) {
      camTrack.enabled = cameraOnRef.current;
      const videoSender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
      if (videoSender) {
        await videoSender.replaceTrack(camTrack);
        console.log("[WebRTC Diagnostic] Restored camera track on video sender");
      }

      if (localStreamRef.current) {
        const currentVideos = localStreamRef.current.getVideoTracks();
        currentVideos.forEach((v) => localStreamRef.current?.removeTrack(v));
        localStreamRef.current.addTrack(camTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
    }

    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "peer-state-changed",
        payload: {
          senderId: userId,
          micOn: micOnRef.current,
          cameraOn: cameraOnRef.current,
        },
      });
    }
  }, [userId]);

  // Toggle Screen Sharing
  const toggleScreenShare = useCallback(async () => {
    resumeAudioContext();
    if (!pcRef.current) return;

    if (screenSharing) {
      await stopScreenShare();
      return;
    }

    // Check display media API support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setMediaError("Screen sharing is not supported by your browser.");
      return;
    }

    try {
      console.log("[WebRTC Diagnostic] Requesting screen sharing capture");
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false, // Ensure audio sender is untouched
      });

      const screenVideoTrack = screenStream.getVideoTracks()[0];
      if (!screenVideoTrack) return;

      screenStreamRef.current = screenStream;

      // Find outgoing video sender
      const videoSender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
      if (videoSender) {
        await videoSender.replaceTrack(screenVideoTrack);
        console.log("[WebRTC Diagnostic] Replaced video track with screen track on RTP sender");
      } else {
        pcRef.current.addTrack(screenVideoTrack, localStreamRef.current || screenStream);
      }

      // Update local preview
      if (localStreamRef.current) {
        const oldVideos = localStreamRef.current.getVideoTracks();
        oldVideos.forEach((v) => localStreamRef.current?.removeTrack(v));
        localStreamRef.current.addTrack(screenVideoTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

      setScreenSharing(true);

      // Handle browser's native "Stop Sharing" UI banner
      screenVideoTrack.onended = () => {
        console.log("[WebRTC Diagnostic] Screen sharing ended via native browser control");
        stopScreenShare();
      };

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "peer-state-changed",
          payload: {
            senderId: userId,
            micOn: micOnRef.current,
            cameraOn: true,
          },
        });
      }
    } catch (err: any) {
      // User cancelled picker
      if (err.name === "NotAllowedError" || err.name === "AbortError") {
        console.log("[WebRTC Diagnostic] Screen sharing cancelled by user");
        return;
      }
      console.error("[WebRTC Diagnostic] Screen share error:", err);
      setMediaError("Could not start screen sharing.");
    }
  }, [screenSharing, stopScreenShare, userId, resumeAudioContext]);

  // Retry initialization
  const retryMediaAndConnection = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setAuthError(null);
    setMediaError(null);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    cleanupPeerConnection();
    cleanupLocalMedia();
    initializeWebRTC();
  }, [cleanupPeerConnection, cleanupLocalMedia, initializeWebRTC]);

  // Hang up call
  const hangUp = useCallback(async () => {
    initCountRef.current++;
    if (channelRef.current) {
      try {
        channelRef.current.send({
          type: "broadcast",
          event: "participant-left",
          payload: { senderId: userId },
        });
      } catch (e) {
        // ignore
      }
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    cleanupPeerConnection();
    cleanupLocalMedia();
    setConnectionState("closed");
  }, [cleanupPeerConnection, cleanupLocalMedia, userId]);

  return {
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
  };
}
