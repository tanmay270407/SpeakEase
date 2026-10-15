export interface WebRTCConfiguration extends RTCConfiguration {
  iceServers: RTCIceServer[];
}

/**
 * Returns RTCConfiguration for WebRTC Peer Connection.
 * Uses public STUN servers by default and optional TURN credentials
 * if supplied via environment variables (VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_PASSWORD).
 */
export const getRTCConfiguration = (): WebRTCConfiguration => {
  const turnUrl = (import.meta as any).env?.VITE_TURN_URL;
  const turnUsername = (import.meta as any).env?.VITE_TURN_USERNAME;
  const turnPassword = (import.meta as any).env?.VITE_TURN_PASSWORD;

  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ];

  if (turnUrl && turnUsername && turnPassword) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnPassword,
    });
  }

  return {
    iceServers,
    iceCandidatePoolSize: 10,
  };
};
