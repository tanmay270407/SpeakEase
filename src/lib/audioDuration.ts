import getBlobDuration from 'get-blob-duration';

/**
 * Accurately extracts the authoritative media duration from an audio Blob.
 * Handles the known Chromium/Chrome bug where MediaRecorder WebM blobs report
 * `Infinity` duration in HTML5 audio elements by employing the standard
 * video element seek-to-end workaround, plus fallbacks to AudioContext and HTMLAudioElement.
 */
export async function getAuthoritativeAudioDuration(blob: Blob): Promise<number> {
  if (!blob || blob.size === 0) return 0;

  // Method 1: get-blob-duration (Chromium WebM Infinity patch)
  try {
    const durationPromise = getBlobDuration(blob);
    const timeoutPromise = new Promise<number>((_, reject) => 
      setTimeout(() => reject(new Error('getBlobDuration timeout')), 2500)
    );
    const dur = await Promise.race([durationPromise, timeoutPromise]);
    if (Number.isFinite(dur) && dur > 0) {
      return dur < 1 ? 1 : Math.round(dur);
    }
  } catch (err) {
    console.warn('[audioDuration] getBlobDuration failed or timed out:', err);
  }

  // Method 2: HTMLAudioElement with manual seek workaround
  try {
    const manualDur = await new Promise<number>((resolve) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      const url = URL.createObjectURL(blob);
      let resolved = false;

      const finish = (d: number) => {
        if (!resolved) {
          resolved = true;
          URL.revokeObjectURL(url);
          resolve(d);
        }
      };

      const timer = setTimeout(() => finish(0), 2000);

      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          clearTimeout(timer);
          finish(audio.duration);
        } else {
          // Force Chrome to calculate WebM duration by seeking to end
          audio.currentTime = Number.MAX_SAFE_INTEGER;
          audio.ontimeupdate = () => {
            audio.ontimeupdate = null;
            clearTimeout(timer);
            const d = Number.isFinite(audio.duration) && audio.duration > 0 
              ? audio.duration 
              : (Number.isFinite(audio.currentTime) && audio.currentTime > 0 ? audio.currentTime : 0);
            finish(d);
          };
        }
      };

      audio.onerror = () => {
        clearTimeout(timer);
        finish(0);
      };

      audio.src = url;
    });

    if (manualDur > 0) {
      return manualDur < 1 ? 1 : Math.round(manualDur);
    }
  } catch (audioErr) {
    console.warn('[audioDuration] HTMLAudioElement fallback failed:', audioErr);
  }

  // Method 3: Web Audio API decodeAudioData
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const audioCtx = new AudioContextClass();
      const arrayBuffer = await blob.slice().arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const dur = audioBuffer.duration;
      await audioCtx.close();
      if (Number.isFinite(dur) && dur > 0) {
        return dur < 1 ? 1 : Math.round(dur);
      }
    }
  } catch (decodeErr) {
    console.warn('[audioDuration] AudioContext decode failed:', decodeErr);
  }

  return blob.size > 0 ? 1 : 0;
}
