import { useState, useEffect, useRef } from 'react';
import { Play, Pause, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDuration } from '../lib/utils';
import { getAuthoritativeAudioDuration } from '../lib/audioDuration';

export interface SegmentPlaybackRequest {
  id: string;
  startTimeSec: number;
  endTimeSec: number;
  triggerTimestamp?: number;
}

interface AudioPlayerProps {
  sessionId: string;
  initialDuration?: number;
  seekTimeSec?: number | null;
  segmentRequest?: SegmentPlaybackRequest | null;
  onSegmentPlaybackEnd?: (segmentId: string) => void;
  onDurationLoaded?: (duration: number) => void;
  onError?: (error: string) => void;
}

export function AudioPlayer({
  sessionId,
  initialDuration,
  seekTimeSec,
  segmentRequest,
  onSegmentPlaybackEnd,
  onDurationLoaded,
  onError,
}: AudioPlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeSegmentRef = useRef<{ id: string; startTimeSec: number; endTimeSec: number } | null>(null);

  // Handle seekTimeSec legacy prop
  useEffect(() => {
    if (typeof seekTimeSec === 'number' && audioRef.current && audioUrl) {
      activeSegmentRef.current = null;
      audioRef.current.currentTime = Math.max(0, seekTimeSec);
      setProgress(Math.max(0, seekTimeSec));
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [seekTimeSec, audioUrl]);

  // Handle segmentPlayback requests (Seek to startTime, play until endTime, then stop)
  useEffect(() => {
    if (!audioRef.current || !audioUrl) return;

    if (!segmentRequest) {
      // If segmentRequest was reset to null, pause audio if active segment was playing
      if (activeSegmentRef.current) {
        audioRef.current.pause();
        activeSegmentRef.current = null;
        setIsPlaying(false);
      }
      return;
    }

    const { id, startTimeSec, endTimeSec } = segmentRequest;

    if (typeof startTimeSec !== 'number' || isNaN(startTimeSec) || startTimeSec < 0) {
      console.warn("Invalid segment start timestamp:", startTimeSec);
      if (onError) onError("Invalid event timestamp for audio replay.");
      if (onSegmentPlaybackEnd) onSegmentPlaybackEnd(id);
      return;
    }

    const validEnd = typeof endTimeSec === 'number' && !isNaN(endTimeSec) && endTimeSec > startTimeSec
      ? endTimeSec
      : startTimeSec + 0.8;

    // Pause current audio before resetting position
    audioRef.current.pause();

    // Set active segment reference BEFORE changing currentTime
    activeSegmentRef.current = { id, startTimeSec, endTimeSec: validEnd };

    // Seek to exact segment start
    audioRef.current.currentTime = startTimeSec;
    setProgress(startTimeSec);

    // Play segment
    audioRef.current
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch((err) => {
        console.warn("Error playing audio segment:", err);
        activeSegmentRef.current = null;
        setIsPlaying(false);
        if (onSegmentPlaybackEnd) onSegmentPlaybackEnd(id);
        if (onError) onError("Audio segment playback failed.");
      });
  }, [segmentRequest, audioUrl]);

  useEffect(() => {
    if (initialDuration && initialDuration > 0 && duration !== initialDuration) {
      setDuration(initialDuration);
    }
  }, [initialDuration]);

  useEffect(() => {
    let isMounted = true;
    
    async function loadAudio() {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const response = await fetch(`/api/audio/${sessionId}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Audio could not be saved.");
          }
          if (response.status === 403) throw new Error("Unauthorized to access this recording");
          throw new Error("Audio could not be saved.");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        if (isMounted) {
          setAudioUrl(url);
          getAuthoritativeAudioDuration(blob).then((exactDur) => {
            if (isMounted && exactDur > 0) {
              setDuration(exactDur);
              if (onDurationLoaded) {
                onDurationLoaded(exactDur);
              }
            }
          }).catch((err) => {
            console.warn("Failed to extract blob duration in player:", err);
          });
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message);
          if (onError) {
            onError(err.message);
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadAudio();

    return () => {
      isMounted = false;
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [sessionId]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    // Clear active segment if user interacts with full player manually
    if (activeSegmentRef.current) {
      const prevId = activeSegmentRef.current.id;
      activeSegmentRef.current = null;
      if (onSegmentPlaybackEnd) onSegmentPlaybackEnd(prevId);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    setProgress(current);

    // Precise segment end boundary check
    if (activeSegmentRef.current) {
      if (current >= activeSegmentRef.current.endTimeSec) {
        const finishedId = activeSegmentRef.current.id;
        audioRef.current.pause();
        activeSegmentRef.current = null;
        setIsPlaying(false);
        if (onSegmentPlaybackEnd) {
          onSegmentPlaybackEnd(finishedId);
        }
      }
    }
  };

  const updateLoadedDuration = () => {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration;
    if (Number.isFinite(dur) && dur > 0) {
      const rounded = dur < 1 ? 1 : Math.round(dur);
      setDuration(rounded);
      if (onDurationLoaded) {
        onDurationLoaded(rounded);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    if (activeSegmentRef.current) {
      const prevId = activeSegmentRef.current.id;
      activeSegmentRef.current = null;
      if (onSegmentPlaybackEnd) onSegmentPlaybackEnd(prevId);
    }
    const time = Number(e.target.value);
    audioRef.current.currentTime = time;
    setProgress(time);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (activeSegmentRef.current) {
      const finishedId = activeSegmentRef.current.id;
      activeSegmentRef.current = null;
      if (onSegmentPlaybackEnd) onSegmentPlaybackEnd(finishedId);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 border border-slate-200 rounded-md bg-slate-50">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-600 mr-2" />
        <span className="text-sm text-slate-500">Loading secure audio...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center p-4 border border-amber-200 rounded-md bg-amber-50">
        <AlertCircle className="h-5 w-5 text-amber-500 mr-2 flex-shrink-0" />
        <span className="text-sm text-amber-700">{error}</span>
      </div>
    );
  }

  if (!audioUrl) return null;

  return (
    <div className="flex flex-col gap-3 p-4 border border-slate-200 rounded-md bg-white shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-900">Session Recording</span>
        <span className="text-xs text-slate-500 font-medium px-2 py-0.5 bg-slate-100 rounded-full">Confidential</span>
      </div>
      
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-700 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          aria-label={isPlaying ? "Pause recording" : "Play recording"}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-1" />}
        </button>
        
        <div className="flex-1 flex flex-col gap-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={progress}
            onChange={handleSeek}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            aria-label="Seek recording"
          />
          <div className="flex justify-between text-xs text-slate-500 font-medium mt-1">
            <span>{formatDuration(progress)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
      </div>
      
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={updateLoadedDuration}
        onDurationChange={updateLoadedDuration}
        onEnded={handleEnded}
        className="hidden"
      />
    </div>
  );
}

