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
  // Stable Correlation ID for deterministic call tracing across participants
  const correlationIdRef = useRef<string>(
    `${userRole.toUpperCase()}-${Math.random().toString(36).substring(2, 7)}`
  );
  const correlationId = correlationIdRef.current;

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

  // Error & Status handling
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signalingNotice, setSignalingNotice] = useState<string | null>(null);

  // Audio level meter
  const [audioLevel, setAudioLevel] = useState(0);

  // Callback refs to decouple unstable functions from effect dependencies
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  const onDisconnectedRef = useRef(onDisconnected);
  onDisconnectedRef.current = onDisconnected;

  // Stable option refs
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const userRoleRef = useRef(userRole);
  userRoleRef.current = userRole;

  // Sync mic/camera states to refs for broadcast payloads
  const micOnRef = useRef(micOn);
  micOnRef.current = micOn;
  const cameraOnRef = useRef(cameraOn);
  cameraOnRef.current = cameraOn;

  // Lifecycle & Idempotency guards
  const initCountRef = useRef<number>(0);
  const mediaAcquirePromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const isSettingRemoteRef = useRef<boolean>(false);
  const isCreatingOfferRef = useRef<boolean>(false);
  const isSignalingInitializingRef = useRef<boolean>(false);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  // WebRTC & Media persistent instances
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const iceCandidatesBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  // Helper to resume audio context on user interaction
  const resumeAudioContext = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch((e) => {
        console.warn(`[WebRTC:${correlationId}] AudioContext resume notice:`, e);
      });
    }
  }, [correlationId]);

  // Clean up WebRTC peer connection only
  const cleanupPeerConnection = useCallback(() => {
    if (pcRef.current) {
      console.log(`[WebRTC:${correlationId}] Cleaning up RTCPeerConnection (signaling teardown)`);
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      try {
        pcRef.current.close();
      } catch (e) {
        // ignore
      }
      pcRef.current = null;
    }
    isSettingRemoteRef.current = false;
    isCreatingOfferRef.current = false;
    iceCandidatesBufferRef.current = [];
  }, [correlationId]);

  // Clean up local media tracks and audio analysis (ONLY on final unmount or explicit close)
  const cleanupLocalMedia = useCallback(() => {
    console.log(`[WebRTC:${correlationId}] Stopping local media tracks & AudioContext (final teardown)`);
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
      screenStreamRef.current.getTracks().forEach((track) => {
        console.log(`[WebRTC:${correlationId}] Stopping screen track: ${track.id}`);
        track.stop();
      });
      screenStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log(`[WebRTC:${correlationId}] Stopping local track: kind=${track.kind}, id=${track.id}`);
        track.stop();
      });
      localStreamRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      cameraStreamRef.current = null;
    }
    mediaAcquirePromiseRef.current = null;
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setAudioLevel(0);
    setScreenSharing(false);
  }, [correlationId]);

  // Clear signaling pulse timers
  const clearTimers = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  }, []);

  // -------------------------------------------------------------
  // 1. Separate Media Lifecycle: Acquire or Reuse Local Media
  // -------------------------------------------------------------
  const ensureLocalMedia = useCallback(async (): Promise<MediaStream | null> => {
    // If we already have an active stream with live tracks, reuse it!
    if (localStreamRef.current) {
      const liveTracks = localStreamRef.current.getTracks().filter((t) => t.readyState === "live");
      if (liveTracks.length > 0) {
        console.log(`[WebRTC:${correlationId}] Reusing existing active local stream with ${liveTracks.length} live track(s)`);
        setLocalStream(localStreamRef.current);
        return localStreamRef.current;
      }
      console.warn(`[WebRTC:${correlationId}] Existing local stream tracks have ended; re-acquiring`);
    }

    // If an acquisition is already in progress, await the existing promise (Idempotent)
    if (mediaAcquirePromiseRef.current) {
      console.log(`[WebRTC:${correlationId}] Awaiting in-flight getUserMedia request...`);
      return mediaAcquirePromiseRef.current;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errMsg = "Camera and microphone access requires a secure context (HTTPS) or is not supported by your browser.";
      console.error(`[WebRTC:${correlationId}] ${errMsg}`);
      setMediaError(errMsg);
      return null;
    }

    const acquirePromise = (async () => {
      let stream: MediaStream | null = null;
      try {
        console.log(`[WebRTC:${correlationId}] Calling navigator.mediaDevices.getUserMedia({video, audio})`);
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
        console.warn(`[WebRTC:${correlationId}] Primary getUserMedia failed:`, primaryErr);

        if (primaryErr.name === "NotAllowedError" || primaryErr.name === "PermissionDeniedError") {
          setMediaError("Camera and microphone permissions were denied. Please grant permission in your browser address bar.");
          return null;
        } else if (primaryErr.name === "NotReadableError" || primaryErr.name === "TrackStartError") {
          setMediaError("Camera or microphone is already in use by another application. Please close other video apps.");
          return null;
        }

        // Audio-only fallback if video hardware was missing or overconstrained
        try {
          console.log(`[WebRTC:${correlationId}] Attempting audio-only fallback getUserMedia`);
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
          console.error(`[WebRTC:${correlationId}] Audio fallback also failed:`, audioErr);
          setMediaError("No microphone or camera devices were found on your computer or phone.");
          return null;
        }
      }

      if (!stream) return null;

      // Log acquired track details safely
      stream.getTracks().forEach((track) => {
        console.log(`[WebRTC:${correlationId}] Track acquired: kind=${track.kind}, id=${track.id}, readyState=${track.readyState}, enabled=${track.enabled}`);
        track.onended = () => {
          console.warn(`[WebRTC:${correlationId}] Local track ended: ${track.kind} (${track.id})`);
          if (track.kind === "video" && cameraOnRef.current) {
            setMediaError("Your camera was disconnected or turned off.");
          }
        };
      });

      localStreamRef.current = stream;
      cameraStreamRef.current = stream;
      setLocalStream(stream);

      // Setup Web Audio API analyzer for microphone meter
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          audioContextRef.current = ctx;

          if (ctx.state === "suspended") {
            ctx.resume().catch((e) => console.warn(`[WebRTC:${correlationId}] AudioContext resume notice:`, e));
          }

          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.5;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const checkAudio = () => {
            if (!localStreamRef.current) return;
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
        console.warn(`[WebRTC:${correlationId}] AudioContext setup notice:`, e);
      }

      return stream;
    })();

    mediaAcquirePromiseRef.current = acquirePromise;
    try {
      const res = await acquirePromise;
      return res;
    } finally {
      mediaAcquirePromiseRef.current = null;
    }
  }, [correlationId]);

  // -------------------------------------------------------------
  // 2. Authorization Verification
  // -------------------------------------------------------------
  const verifyAuthorization = useCallback(async (): Promise<boolean> => {
    const sId = sessionIdRef.current;
    const uId = userIdRef.current;
    const role = userRoleRef.current;

    if (!uId || !sId) {
      console.warn(`[WebRTC:${correlationId}] Cannot verify authorization: userId or sessionId missing`, { uId, sId });
      return false;
    }

    try {
      setConnectionState("authorizing");
      console.log(`[WebRTC:${correlationId}] Verifying session authorization: role=${role}, session=${sId}`);

      const { data: sessionData, error: sessionErr } = await (
        supabase.from("live_sessions") as any
      )
        .select("id, patient_id, slp_id, status")
        .eq("id", sId)
        .maybeSingle();

      if (sessionErr || !sessionData) {
        console.warn(`[WebRTC:${correlationId}] Session lookup error or not found:`, sessionErr);
        setAuthError("Session not found or invalid session ID.");
        return false;
      }

      if (role === "patient") {
        if (sessionData.patient_id !== uId) {
          console.warn(`[WebRTC:${correlationId}] Patient user ID does not match session patient_id`);
          setAuthError("Unauthorized: You are not the assigned patient for this session.");
          return false;
        }
      } else if (role === "slp") {
        const { data: slpData } = await (supabase.from("slps") as any)
          .select("id, user_id")
          .eq("id", sessionData.slp_id)
          .maybeSingle();

        const slpMatches = (slpData && slpData.user_id === uId) || sessionData.slp_id === uId;
        if (!slpMatches) {
          console.warn(`[WebRTC:${correlationId}] SLP user ID does not match session slp_id`);
          setAuthError("Unauthorized: You are not the assigned SLP for this session.");
          return false;
        }
      }

      if (sessionData.status === "cancelled" || sessionData.status === "rejected") {
        console.warn(`[WebRTC:${correlationId}] Session status is ${sessionData.status}`);
        setAuthError(`This session has been ${sessionData.status}.`);
        return false;
      }

      // Confirm active patient assignment if record exists
      if (sessionData.patient_id && sessionData.slp_id) {
        const { data: paData } = await (
          supabase.from("patient_assignments") as any
        )
          .select("status")
          .eq("patient_id", sessionData.patient_id)
          .eq("slp_id", sessionData.slp_id)
          .maybeSingle();

        if (paData && paData.status !== "ACTIVE") {
          console.warn(`[WebRTC:${correlationId}] Patient assignment is not ACTIVE:`, paData?.status);
          setAuthError("Unauthorized: Patient and SLP assignment is not active.");
          return false;
        }
      }

      console.log(`[WebRTC:${correlationId}] Authorization check passed. SessionStatus=${sessionData.status}`);
      setAuthError(null);
      return true;
    } catch (err: any) {
      console.error(`[WebRTC:${correlationId}] Authorization check exception:`, err);
      setAuthError("Error checking session authorization.");
      return false;
    }
  }, [correlationId]);

  // Flush buffered ICE candidates
  const flushIceCandidates = async (pc: RTCPeerConnection) => {
    const count = iceCandidatesBufferRef.current.length;
    if (count > 0) {
      console.log(`[WebRTC:${correlationId}] Flushing ${count} buffered ICE candidate(s)`);
    }
    while (iceCandidatesBufferRef.current.length > 0) {
      const candidate = iceCandidatesBufferRef.current.shift();
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn(`[WebRTC:${correlationId}] Error adding buffered ICE candidate:`, e);
        }
      }
    }
  };

  // -------------------------------------------------------------
  // 3. Separate Signaling Lifecycle: Connect Channel & PeerConnection
  // -------------------------------------------------------------
  const setupSignalingAndPeer = useCallback(async () => {
    if (isSignalingInitializingRef.current) {
      console.log(`[WebRTC:${correlationId}] Signaling initialization already in progress, ignoring duplicate call`);
      return;
    }
    isSignalingInitializingRef.current = true;

    const currentInitId = ++initCountRef.current;
    console.log(`[WebRTC:${correlationId}] === Starting Signaling Run #${currentInitId} for sessionId=${sessionIdRef.current} ===`);

    clearTimers();
    cleanupPeerConnection();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setSignalingNotice(null);

    // Step A: Authorization Check
    const authorized = await verifyAuthorization();
    if (!authorized) {
      if (currentInitId === initCountRef.current) {
        setConnectionState("failed");
      }
      isSignalingInitializingRef.current = false;
      return;
    }

    if (currentInitId !== initCountRef.current) {
      isSignalingInitializingRef.current = false;
      return;
    }

    // Step B: Ensure Local Media is Ready (without restarting active tracks)
    const mediaStream = await ensureLocalMedia();
    if (!mediaStream && currentInitId === initCountRef.current) {
      setConnectionState("failed");
      isSignalingInitializingRef.current = false;
      return;
    }

    if (currentInitId !== initCountRef.current) {
      isSignalingInitializingRef.current = false;
      return;
    }

    // Step C: Synchronize Supabase Realtime Auth Token
    try {
      const { data: authSessionData } = await supabase.auth.getSession();
      const accessToken = authSessionData.session?.access_token;
      if (accessToken) {
        console.log(`[WebRTC:${correlationId}] Realtime setAuth with active user session`);
        await supabase.realtime.setAuth(accessToken);
      } else {
        console.warn(`[WebRTC:${correlationId}] Warning: No active session access_token found in Supabase Auth`);
      }
    } catch (tokenErr) {
      console.warn(`[WebRTC:${correlationId}] Notice setting Realtime auth token:`, tokenErr);
    }

    if (currentInitId !== initCountRef.current) {
      isSignalingInitializingRef.current = false;
      return;
    }

    setConnectionState("connecting");

    // Step D: Create RTCPeerConnection instance
    console.log(`[WebRTC:${correlationId}] Creating RTCPeerConnection`);
    const config = getRTCConfiguration();
    const pc = new RTCPeerConnection(config);
    pcRef.current = pc;

    // Attach local media tracks
    let hasAudioSender = false;
    let hasVideoSender = false;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log(`[WebRTC:${correlationId}] Attaching track to PC: kind=${track.kind}, id=${track.id}`);
        pc.addTrack(track, localStreamRef.current!);
        if (track.kind === "audio") hasAudioSender = true;
        if (track.kind === "video") hasVideoSender = true;
      });
    }

    // Ensure transceivers exist for bidirectional negotiation
    if (!hasAudioSender) {
      console.log(`[WebRTC:${correlationId}] Adding audio transceiver fallback (sendrecv)`);
      pc.addTransceiver("audio", { direction: "sendrecv" });
    }
    if (!hasVideoSender) {
      console.log(`[WebRTC:${correlationId}] Adding video transceiver fallback (sendrecv)`);
      pc.addTransceiver("video", { direction: "sendrecv" });
    }

    // Local ICE candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        console.log(`[WebRTC:${correlationId}] Local ICE candidate generated, broadcasting`);
        channelRef.current.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: {
            candidate: event.candidate.toJSON(),
            senderId: userIdRef.current,
          },
        });
      }
    };

    // Remote track handler
    pc.ontrack = (event) => {
      console.log(`[WebRTC:${correlationId}] ontrack received: kind=${event.track.kind}, id=${event.track.id}`);
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

      setRemoteStream(new MediaStream(stream.getTracks()));

      event.track.onunmute = () => {
        console.log(`[WebRTC:${correlationId}] Remote track unmuted: ${event.track.kind}`);
        if (remoteStreamRef.current) {
          setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
        }
      };

      event.track.onended = () => {
        console.log(`[WebRTC:${correlationId}] Remote track ended: ${event.track.kind}`);
        if (remoteStreamRef.current) {
          setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
        }
      };
    };

    // ICE connection state changes & ICE Restart
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC:${correlationId}] ICE state change: ${state}`);
      setIceConnectionState(state);

      if (state === "connected" || state === "completed") {
        setConnectionState("connected");
        setSignalingNotice(null);
        reconnectAttemptsRef.current = 0;
        clearTimers();
        if (onConnectedRef.current) onConnectedRef.current();
      } else if (state === "disconnected") {
        setConnectionState("reconnecting");
        if (onDisconnectedRef.current) onDisconnectedRef.current();
      } else if (state === "failed") {
        if (reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current += 1;
          console.log(`[WebRTC:${correlationId}] ICE failed, attempting restart (${reconnectAttemptsRef.current}/3)`);
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
                    senderId: userIdRef.current,
                    isIceRestart: true,
                  },
                });
              }
            } catch (err) {
              console.error(`[WebRTC:${correlationId}] Error generating ICE restart offer:`, err);
            }
          })();
        } else {
          setConnectionState("failed");
          setAuthError("Connection failed and unable to reconnect automatically. Click Retry Connection.");
        }
      } else if (state === "closed") {
        setConnectionState("closed");
      }
    };

    // Peer connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC:${correlationId}] Connection state change: ${pc.connectionState}`);
      if (pc.connectionState === "connected") {
        setConnectionState("connected");
      } else if (pc.connectionState === "failed") {
        setConnectionState("failed");
        setAuthError("Peer connection failed. Click Retry Connection.");
      }
    };

    // Step E: Setup Private Realtime Channel
    const channelName = `room:${sessionIdRef.current}`;
    console.log(`[WebRTC:${correlationId}] Subscribing to private Realtime channel: ${channelName}`);

    const channel = supabase.channel(channelName, {
      config: {
        private: true,
        broadcast: { ack: false, self: false },
      },
    });
    channelRef.current = channel;

    // Helper: Initiates SDP offer idempotently
    const checkAndInitiateOffer = async (triggerReason: string) => {
      if (currentInitId !== initCountRef.current) return;
      if (!pcRef.current || !channelRef.current) return;
      const currentPc = pcRef.current;

      const isOfferer = userRoleRef.current === "patient";
      if (!isOfferer) {
        console.log(`[WebRTC:${correlationId}] Non-offerer (${userRoleRef.current}) awaiting offer. Trigger: ${triggerReason}`);
        return;
      }

      if (isCreatingOfferRef.current) {
        console.log(`[WebRTC:${correlationId}] Offer creation already in progress, skipping duplicate call`);
        return;
      }

      if (currentPc.signalingState === "stable" && !currentPc.remoteDescription) {
        try {
          isCreatingOfferRef.current = true;
          console.log(`[WebRTC:${correlationId}] Offerer creating SDP offer. Trigger: ${triggerReason}`);
          const offer = await currentPc.createOffer();
          await currentPc.setLocalDescription(offer);
          console.log(`[WebRTC:${correlationId}] Local description (offer) set, broadcasting sdp-offer`);

          const sendResult = await channelRef.current.send({
            type: "broadcast",
            event: "sdp-offer",
            payload: {
              sdp: offer,
              senderId: userIdRef.current,
            },
          });
          console.log(`[WebRTC:${correlationId}] sdp-offer send status:`, sendResult);
        } catch (e) {
          console.error(`[WebRTC:${correlationId}] Error creating SDP offer:`, e);
        } finally {
          isCreatingOfferRef.current = false;
        }
      } else if (currentPc.signalingState === "have-local-offer") {
        console.log(`[WebRTC:${correlationId}] Local offer pending, re-broadcasting sdp-offer (Trigger: ${triggerReason})`);
        if (currentPc.localDescription) {
          channelRef.current.send({
            type: "broadcast",
            event: "sdp-offer",
            payload: {
              sdp: currentPc.localDescription,
              senderId: userIdRef.current,
            },
          });
        }
      }
    };

    // Register signaling event listeners
    channel
      .on("broadcast", { event: "participant-joined" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userIdRef.current) return;

        console.log(`[WebRTC:${correlationId}] Received participant-joined from remote sender: ${payload.payload?.senderId}`);
        setIsPeerJoined(true);

        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "peer-state-changed",
            payload: {
              senderId: userIdRef.current,
              micOn: micOnRef.current,
              cameraOn: cameraOnRef.current,
            },
          });
        }

        await checkAndInitiateOffer("participant-joined event");
      })
      .on("broadcast", { event: "sdp-offer" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userIdRef.current) return;

        console.log(`[WebRTC:${correlationId}] Received sdp-offer from remote sender`);
        setIsPeerJoined(true);

        try {
          isSettingRemoteRef.current = true;
          const offerSdp = payload.payload?.sdp;

          // Glare handling
          if (pc.signalingState === "have-local-offer") {
            if (userRoleRef.current === "slp") {
              console.log(`[WebRTC:${correlationId}] Collision detected. Polite peer (SLP) rolling back local offer`);
              await pc.setLocalDescription({ type: "rollback" });
            } else {
              console.log(`[WebRTC:${correlationId}] Collision detected. Impolite peer (Patient) ignoring offer`);
              return;
            }
          }

          await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
          console.log(`[WebRTC:${correlationId}] Remote description (offer) set`);
          await flushIceCandidates(pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log(`[WebRTC:${correlationId}] Local description (answer) set, broadcasting sdp-answer`);

          if (channelRef.current) {
            const sendRes = await channelRef.current.send({
              type: "broadcast",
              event: "sdp-answer",
              payload: {
                sdp: answer,
                senderId: userIdRef.current,
              },
            });
            console.log(`[WebRTC:${correlationId}] sdp-answer send status:`, sendRes);
          }
        } catch (e) {
          console.error(`[WebRTC:${correlationId}] Error handling SDP offer:`, e);
        } finally {
          isSettingRemoteRef.current = false;
        }
      })
      .on("broadcast", { event: "sdp-answer" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userIdRef.current) return;

        console.log(`[WebRTC:${correlationId}] Received sdp-answer from remote sender`);
        try {
          const answerSdp = payload.payload?.sdp;
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
            console.log(`[WebRTC:${correlationId}] Remote description (answer) set`);
            await flushIceCandidates(pc);
          }
        } catch (e) {
          console.error(`[WebRTC:${correlationId}] Error handling SDP answer:`, e);
        }
      })
      .on("broadcast", { event: "ice-candidate" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userIdRef.current) return;

        const candidateInit = payload.payload?.candidate;
        if (!candidateInit) return;

        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
            console.log(`[WebRTC:${correlationId}] Remote ICE candidate applied`);
          } catch (e) {
            console.warn(`[WebRTC:${correlationId}] Error adding ICE candidate:`, e);
          }
        } else {
          console.log(`[WebRTC:${correlationId}] Buffering remote ICE candidate until remote description set`);
          iceCandidatesBufferRef.current.push(candidateInit);
        }
      })
      .on("broadcast", { event: "peer-state-changed" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userIdRef.current) return;

        console.log(`[WebRTC:${correlationId}] Received peer-state-changed: micOn=${payload.payload?.micOn}, cameraOn=${payload.payload?.cameraOn}`);
        setIsPeerJoined(true);
        if (typeof payload.payload?.cameraOn === "boolean") {
          setIsRemoteCameraOff(!payload.payload.cameraOn);
        }
        if (typeof payload.payload?.micOn === "boolean") {
          setIsRemoteMicMuted(!payload.payload.micOn);
        }

        await checkAndInitiateOffer("peer-state-changed event");
      })
      .on("broadcast", { event: "participant-left" }, (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userIdRef.current) return;

        console.log(`[WebRTC:${correlationId}] Received participant-left`);
        setIsPeerJoined(false);
        setRemoteStream(null);
        setConnectionState("connecting");
      })
      .subscribe((status, err) => {
        if (currentInitId !== initCountRef.current) return;
        console.log(`[WebRTC:${correlationId}] Realtime subscription status: ${status}`, err || "");

        if (status === "SUBSCRIBED") {
          console.log(`[WebRTC:${correlationId}] Channel SUBSCRIBED. Announcing presence and state`);
          channel.send({
            type: "broadcast",
            event: "participant-joined",
            payload: {
              senderId: userIdRef.current,
              userRole: userRoleRef.current,
            },
          });

          channel.send({
            type: "broadcast",
            event: "peer-state-changed",
            payload: {
              senderId: userIdRef.current,
              micOn: micOnRef.current,
              cameraOn: cameraOnRef.current,
            },
          });

          // Gentle handshake pulse (every 2.5s ONLY while awaiting ICE connection)
          if (!heartbeatTimerRef.current) {
            heartbeatTimerRef.current = setInterval(() => {
              if (currentInitId !== initCountRef.current) return;
              if (!channelRef.current || !pcRef.current) return;

              if (pcRef.current.iceConnectionState !== "connected" && pcRef.current.iceConnectionState !== "completed") {
                channelRef.current.send({
                  type: "broadcast",
                  event: "participant-joined",
                  payload: {
                    senderId: userIdRef.current,
                    userRole: userRoleRef.current,
                  },
                });

                if (userRoleRef.current === "patient" && pcRef.current.signalingState === "have-local-offer") {
                  if (pcRef.current.localDescription) {
                    channelRef.current.send({
                      type: "broadcast",
                      event: "sdp-offer",
                      payload: {
                        sdp: pcRef.current.localDescription,
                        senderId: userIdRef.current,
                      },
                    });
                  }
                }
              }
            }, 2500);
          }

          // 30s signaling timeout monitor
          if (!timeoutTimerRef.current) {
            timeoutTimerRef.current = setTimeout(() => {
              if (currentInitId !== initCountRef.current) return;
              if (pcRef.current?.iceConnectionState !== "connected" && pcRef.current?.iceConnectionState !== "completed") {
                console.warn(`[WebRTC:${correlationId}] 30s elapsed waiting for peer connection`);
                setSignalingNotice(
                  "Waiting for the other participant to enter the session room. If they have already joined, click Retry Connection."
                );
              }
            }, 30000);
          }
        } else if (status === "CHANNEL_ERROR") {
          console.error(`[WebRTC:${correlationId}] Realtime channel error:`, err);
          cleanupPeerConnection();
          setConnectionState("failed");
          setAuthError("Signaling channel connection failed. Private room access rejected or unauthorized.");
        } else if (status === "TIMED_OUT") {
          console.warn(`[WebRTC:${correlationId}] Realtime channel timed out`);
          cleanupPeerConnection();
          setConnectionState("failed");
          setAuthError("Signaling connection timed out. Please check your network connection and retry.");
        } else if (status === "CLOSED") {
          console.log(`[WebRTC:${correlationId}] Realtime channel closed`);
          if (channelRef.current === channel) {
            channelRef.current = null;
          }
          setConnectionState((prev) =>
            prev === "connected" || prev === "connecting" || prev === "reconnecting" ? "closed" : prev
          );
        }
      });

    isSignalingInitializingRef.current = false;
  }, [
    correlationId,
    clearTimers,
    cleanupPeerConnection,
    ensureLocalMedia,
    verifyAuthorization,
  ]);

  // -------------------------------------------------------------
  // 4. Stable Lifecycle Effect (Runs once on mount when isOpen becomes true)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !userId || !sessionId) {
      if (!isOpen) {
        initCountRef.current++;
        clearTimers();
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
        setSignalingNotice(null);
      }
      return;
    }

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

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("click", resumeAudioContext);

    // Start signaling & media orchestration
    setupSignalingAndPeer();

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("click", resumeAudioContext);
      initCountRef.current++;
      clearTimers();
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
  }, [
    isOpen,
    sessionId,
    userId,
    userRole,
    setupSignalingAndPeer,
    cleanupPeerConnection,
    cleanupLocalMedia,
    clearTimers,
    resumeAudioContext,
  ]);

  // -------------------------------------------------------------
  // 5. In-Call Controls (Track toggles only - NEVER restarts signaling)
  // -------------------------------------------------------------
  const toggleMic = useCallback(() => {
    resumeAudioContext();
    const newMicState = !micOn;

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = newMicState;
        console.log(`[WebRTC:${correlationId}] Local audio track enabled set to: ${newMicState}`);
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
          senderId: userIdRef.current,
          micOn: newMicState,
          cameraOn: cameraOnRef.current,
        },
      });
    }
  }, [micOn, resumeAudioContext, correlationId]);

  const toggleCamera = useCallback(async () => {
    resumeAudioContext();
    const newCameraState = !cameraOn;

    let activeCamTrack = cameraStreamRef.current?.getVideoTracks()[0];
    if (newCameraState && (!activeCamTrack || activeCamTrack.readyState === "ended")) {
      try {
        console.log(`[WebRTC:${correlationId}] Camera track ended or missing; re-requesting getUserMedia for video only`);
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

        if (!screenSharing && pcRef.current) {
          const videoSender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
          if (videoSender) {
            await videoSender.replaceTrack(activeCamTrack);
          }
        }
      } catch (err) {
        console.error(`[WebRTC:${correlationId}] Error re-acquiring camera track:`, err);
      }
    }

    if (activeCamTrack) {
      activeCamTrack.enabled = newCameraState;
      console.log(`[WebRTC:${correlationId}] Local video track enabled set to: ${newCameraState}`);
    }

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
          senderId: userIdRef.current,
          micOn: micOnRef.current,
          cameraOn: newCameraState,
        },
      });
    }
  }, [cameraOn, screenSharing, resumeAudioContext, correlationId]);

  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    setScreenSharing(false);

    let camTrack = cameraStreamRef.current?.getVideoTracks()[0];
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
        console.warn(`[WebRTC:${correlationId}] Could not restore camera video after screen share:`, e);
      }
    }

    if (camTrack && pcRef.current) {
      camTrack.enabled = cameraOnRef.current;
      const videoSender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
      if (videoSender) {
        await videoSender.replaceTrack(camTrack);
        console.log(`[WebRTC:${correlationId}] Restored camera track on video sender`);
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
          senderId: userIdRef.current,
          micOn: micOnRef.current,
          cameraOn: cameraOnRef.current,
        },
      });
    }
  }, [correlationId]);

  const toggleScreenShare = useCallback(async () => {
    resumeAudioContext();
    if (!pcRef.current) return;

    if (screenSharing) {
      await stopScreenShare();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setMediaError("Screen sharing is not supported by your browser.");
      return;
    }

    try {
      console.log(`[WebRTC:${correlationId}] Requesting screen sharing capture`);
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const screenVideoTrack = screenStream.getVideoTracks()[0];
      if (!screenVideoTrack) return;

      screenStreamRef.current = screenStream;

      const videoSender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
      if (videoSender) {
        await videoSender.replaceTrack(screenVideoTrack);
        console.log(`[WebRTC:${correlationId}] Replaced video track with screen track on RTP sender`);
      } else {
        pcRef.current.addTrack(screenVideoTrack, localStreamRef.current || screenStream);
      }

      if (localStreamRef.current) {
        const oldVideos = localStreamRef.current.getVideoTracks();
        oldVideos.forEach((v) => localStreamRef.current?.removeTrack(v));
        localStreamRef.current.addTrack(screenVideoTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

      setScreenSharing(true);

      screenVideoTrack.onended = () => {
        console.log(`[WebRTC:${correlationId}] Screen sharing ended via native browser control`);
        stopScreenShare();
      };

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "peer-state-changed",
          payload: {
            senderId: userIdRef.current,
            micOn: micOnRef.current,
            cameraOn: true,
          },
        });
      }
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "AbortError") {
        console.log(`[WebRTC:${correlationId}] Screen sharing cancelled by user`);
        return;
      }
      console.error(`[WebRTC:${correlationId}] Screen share error:`, err);
      setMediaError("Could not start screen sharing.");
    }
  }, [screenSharing, stopScreenShare, resumeAudioContext, correlationId]);

  // Signaling retry without stopping working camera/microphone
  const retryMediaAndConnection = useCallback(() => {
    console.log(`[WebRTC:${correlationId}] User requested retry - restarting signaling only`);
    reconnectAttemptsRef.current = 0;
    clearTimers();
    setAuthError(null);
    setMediaError(null);
    setSignalingNotice(null);
    setupSignalingAndPeer();
  }, [clearTimers, setupSignalingAndPeer, correlationId]);

  // Hang up call
  const hangUp = useCallback(async () => {
    console.log(`[WebRTC:${correlationId}] Hanging up call`);
    initCountRef.current++;
    clearTimers();
    if (channelRef.current) {
      try {
        channelRef.current.send({
          type: "broadcast",
          event: "participant-left",
          payload: { senderId: userIdRef.current },
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
  }, [cleanupPeerConnection, cleanupLocalMedia, clearTimers, correlationId]);

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
    signalingNotice,
    audioLevel,
    correlationId,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    retryMediaAndConnection,
    hangUp,
  };
}
