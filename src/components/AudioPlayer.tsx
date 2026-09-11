import { useState, useEffect, useRef } from 'react';
import { Play, Pause, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AudioPlayerProps {
  sessionId: string;
}

export function AudioPlayer({ sessionId }: AudioPlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
            throw new Error("Audio recording not found or was not saved");
          }
          if (response.status === 403) throw new Error("Unauthorized to access this recording");
          throw new Error("Failed to load audio");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        if (isMounted) {
          setAudioUrl(url);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message);
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
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setProgress(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = Number(e.target.value);
    audioRef.current.currentTime = time;
    setProgress(time);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
            value={progress}
            onChange={handleSeek}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            aria-label="Seek recording"
          />
          <div className="flex justify-between text-xs text-slate-500 font-medium mt-1">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
}
