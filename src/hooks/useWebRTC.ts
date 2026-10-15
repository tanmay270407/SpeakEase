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
  const iceCandidatesBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const isSettingRemoteRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const initCountRef = useRef<number>(0);

  // Sync mic/camera states to refs to prevent initializeWebRTC re-triggers
  const micOnRef = useRef(micOn);
  micOnRef.current = micOn;
  const cameraOnRef = useRef(cameraOn);
  cameraOnRef.current = cameraOn;

  // Verify patient-SLP session authorization before joining room
  const verifyAuthorization = useCallback(async (): Promise<boolean> => {
    if (!userId || !sessionId) return false;

    try {
      setConnectionState("authorizing");

      const { data: sessionData, error: sessionErr } = await (
        supabase.from("live_sessions") as any
      )
        .select("id, patient_id, slp_id, status")
        .eq("id", sessionId)
        .maybeSingle();

      if (sessionErr || !sessionData) {
        setAuthError("Session not found or invalid session ID.");
        return false;
      }

      // Role authorization
      if (userRole === "patient") {
        if (sessionData.patient_id !== userId) {
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
          setAuthError(
            "Unauthorized: Patient and SLP assignment is not active."
          );
          return false;
        }
      }

      setAuthError(null);
      return true;
    } catch (err: any) {
      console.error("Authorization check failed:", err);
      setAuthError("Error checking session authorization.");
      return false;
    }
  }, [sessionId, userId, userRole]);

  // Clean up WebRTC peer connection
  const cleanupPeerConnection = useCallback(() => {
    if (pcRef.current) {
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
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  // Flush buffered ICE candidates after setting remote description
  const flushIceCandidates = async (pc: RTCPeerConnection) => {
    while (iceCandidatesBufferRef.current.length > 0) {
      const candidate = iceCandidatesBufferRef.current.shift();
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("Error adding buffered ICE candidate:", e);
        }
      }
    }
  };

  // Create WebRTC peer connection instance
  const createPeerConnection = useCallback(
    (channel: RealtimeChannel): RTCPeerConnection => {
      cleanupPeerConnection();

      const config = getRTCConfiguration();
      const pc = new RTCPeerConnection(config);
      pcRef.current = pc;

      // Attach local stream tracks to PeerConnection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Handle local ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
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
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        } else {
          setRemoteStream((prev) => {
            if (prev) {
              prev.addTrack(event.track);
              return new MediaStream(prev.getTracks());
            }
            return new MediaStream([event.track]);
          });
        }
      };

      // Handle ICE connection state changes & ICE Restart
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
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
            setConnectionState("reconnecting");

            // Initiate ICE restart with SDP renegotiation offer
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
                console.error("Error generating ICE restart offer:", err);
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

    // Track initialization count to prevent stale callbacks
    const currentInitId = ++initCountRef.current;

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

    // 2. Acquire local audio/video media
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      if (currentInitId !== initCountRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // Attach track ended listener to detect unexpected device disconnection/permission revocation
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (currentInitId === initCountRef.current) {
            setMediaError(
              `Camera or microphone track (${track.kind}) was disconnected.`
            );
          }
        };
      });

      localStreamRef.current = stream;
      cameraStreamRef.current = stream;
      setLocalStream(stream);

      // Web Audio API analyzer setup
      try {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const checkAudio = () => {
            if (currentInitId !== initCountRef.current) return;
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
        console.warn("Audio Context initialization notice:", e);
      }
    } catch (err: any) {
      console.error("Camera/Mic access error:", err);
      if (currentInitId === initCountRef.current) {
        setMediaError(
          "Could not access camera or microphone. Please check browser permissions."
        );
        setConnectionState("failed");
      }
      return;
    }

    if (currentInitId !== initCountRef.current) return;

    setConnectionState("connecting");

    // 3. Setup private Supabase Realtime channel for signaling
    const channelName = `room:${sessionId}`;
    const channel = supabase.channel(channelName, {
      config: {
        private: true,
        broadcast: { ack: false, self: false },
      },
    });

    channelRef.current = channel;

    // Create RTCPeerConnection instance
    const pc = createPeerConnection(channel);

    // Listen for signaling events
    channel
      .on("broadcast", { event: "participant-joined" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userId) return;

        setIsPeerJoined(true);

        // Immediately respond with local presence/state so joining peer gets immediate confirmation
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

        // Deterministic offerer strategy:
        // Patient initiates offer to SLP
        const isOfferer = userRole === "patient";

        if (isOfferer && pc.signalingState === "stable") {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (channelRef.current) {
              channelRef.current.send({
                type: "broadcast",
                event: "sdp-offer",
                payload: {
                  sdp: offer,
                  senderId: userId,
                },
              });
            }
          } catch (e) {
            console.error("Error creating offer:", e);
          }
        }
      })
      .on("broadcast", { event: "sdp-offer" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userId) return;

        setIsPeerJoined(true);

        try {
          isSettingRemoteRef.current = true;
          const offerSdp = payload.payload?.sdp;

          // Glare handling if receiving concurrent offer
          if (pc.signalingState === "have-local-offer") {
            if (userRole === "slp") {
              // Polite peer rolls back local offer
              await pc.setLocalDescription({ type: "rollback" });
            } else {
              // Impolite peer ignores offer collision
              return;
            }
          }

          await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
          await flushIceCandidates(pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

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
          console.error("Error handling SDP offer:", e);
        } finally {
          isSettingRemoteRef.current = false;
        }
      })
      .on("broadcast", { event: "sdp-answer" }, async (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userId) return;

        try {
          const answerSdp = payload.payload?.sdp;
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
            await flushIceCandidates(pc);
          }
        } catch (e) {
          console.error("Error handling SDP answer:", e);
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
          } catch (e) {
            console.warn("Error adding ICE candidate:", e);
          }
        } else {
          iceCandidatesBufferRef.current.push(candidateInit);
        }
      })
      .on("broadcast", { event: "peer-state-changed" }, (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userId) return;
        setIsPeerJoined(true);
        if (typeof payload.payload?.cameraOn === "boolean") {
          setIsRemoteCameraOff(!payload.payload.cameraOn);
        }
        if (typeof payload.payload?.micOn === "boolean") {
          setIsRemoteMicMuted(!payload.payload.micOn);
        }
      })
      .on("broadcast", { event: "participant-left" }, (payload) => {
        if (currentInitId !== initCountRef.current) return;
        if (payload.payload?.senderId === userId) return;
        setIsPeerJoined(false);
        setRemoteStream(null);
        setConnectionState("connecting");
      })
      .subscribe((status, err) => {
        // Prevent stale callbacks from previous subscriptions
        if (currentInitId !== initCountRef.current) return;

        if (status === "SUBSCRIBED") {
          // Announce local participant joined
          channel.send({
            type: "broadcast",
            event: "participant-joined",
            payload: {
              senderId: userId,
              userRole,
            },
          });

          // Send current mic and camera states
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
          console.error("Supabase Realtime private channel error:", err);
          cleanupPeerConnection();
          setConnectionState("failed");
          setAuthError((prev) =>
            prev ||
            "Signaling channel connection failed. Private room access rejected or unauthorized."
          );
        } else if (status === "TIMED_OUT") {
          console.warn("Supabase Realtime channel subscription timed out.");
          cleanupPeerConnection();
          setConnectionState("failed");
          setAuthError((prev) =>
            prev ||
            "Signaling connection timed out. Please check your network connection and retry."
          );
        } else if (status === "CLOSED") {
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

  // Handle open / close effect and window unload listener
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
      initializeWebRTC();
    } else {
      // Clean up when modal closes
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
  }, [isOpen, initializeWebRTC, cleanupPeerConnection, cleanupLocalMedia, userId]);

  // Toggle Mute Audio
  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      const newMicState = !micOn;
      audioTracks.forEach((track) => {
        track.enabled = newMicState;
      });
      setMicOn(newMicState);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "peer-state-changed",
          payload: {
            senderId: userId,
            micOn: newMicState,
            cameraOn,
          },
        });
      }
    }
  }, [micOn, cameraOn, userId]);

  // Toggle Camera
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      const newCameraState = !cameraOn;
      videoTracks.forEach((track) => {
        track.enabled = newCameraState;
      });
      setCameraOn(newCameraState);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "peer-state-changed",
          payload: {
            senderId: userId,
            micOn,
            cameraOn: newCameraState,
          },
        });
      }
    }
  }, [cameraOn, micOn, userId]);

  // Toggle Screen Sharing
  const toggleScreenShare = useCallback(async () => {
    if (!pcRef.current) return;

    if (screenSharing) {
      // Revert back to camera stream
      try {
        if (cameraStreamRef.current) {
          const cameraVideoTrack = cameraStreamRef.current.getVideoTracks()[0];
          const sender = pcRef.current
            .getSenders()
            .find((s) => s.track?.kind === "video");

          if (sender && cameraVideoTrack) {
            await sender.replaceTrack(cameraVideoTrack);
          }

          if (localStreamRef.current) {
            const currentVideo = localStreamRef.current.getVideoTracks()[0];
            if (currentVideo) localStreamRef.current.removeTrack(currentVideo);
            if (cameraVideoTrack) localStreamRef.current.addTrack(cameraVideoTrack);
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
          }
        }
        setScreenSharing(false);
      } catch (err) {
        console.error("Error reverting screen share to camera:", err);
      }
    } else {
      // Start screen capture
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        const screenVideoTrack = screenStream.getVideoTracks()[0];

        const sender = pcRef.current
          .getSenders()
          .find((s) => s.track?.kind === "video");

        if (sender && screenVideoTrack) {
          await sender.replaceTrack(screenVideoTrack);
        }

        if (localStreamRef.current) {
          const currentVideo = localStreamRef.current.getVideoTracks()[0];
          if (currentVideo) localStreamRef.current.removeTrack(currentVideo);
          localStreamRef.current.addTrack(screenVideoTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        }

        setScreenSharing(true);

        screenVideoTrack.onended = async () => {
          setScreenSharing(false);
          if (cameraStreamRef.current && pcRef.current) {
            const camTrack = cameraStreamRef.current.getVideoTracks()[0];
            const videoSender = pcRef.current
              .getSenders()
              .find((s) => s.track?.kind === "video");
            if (videoSender && camTrack) {
              await videoSender.replaceTrack(camTrack);
            }
            if (localStreamRef.current) {
              const currentVideo = localStreamRef.current.getVideoTracks()[0];
              if (currentVideo) localStreamRef.current.removeTrack(currentVideo);
              if (camTrack) localStreamRef.current.addTrack(camTrack);
              setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
            }
          }
        };
      } catch (err) {
        console.error("Screen share canceled or error:", err);
      }
    }
  }, [screenSharing]);

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
