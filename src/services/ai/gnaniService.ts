import dotenv from "dotenv";
dotenv.config({ override: true });

export interface GnaniTranscriptionResult {
  transcript: string;
  confidence?: number;
  wordCount?: number;
  duration?: number;
  provider: "gnani" | "gemini-fallback";
  raw?: any;
}

/**
 * Transcribe audio using Gnani.ai Voice-to-Text ASR API.
 * Primary speech-to-text service in the SpeakEase Multi-AI Pipeline.
 */
export async function transcribeAudioWithGnani(
  audioBuffer: Buffer,
  mimeType: string = "audio/webm"
): Promise<GnaniTranscriptionResult | null> {
  const apiKey = process.env.GNANI_API_KEY;
  console.log(`[transcription_started] Gnani.ai ASR transcription initiated (${audioBuffer.length} bytes, mime: ${mimeType})`);

  if (!apiKey || apiKey.trim() === "" || apiKey === "YOUR_GNANI_API_KEY") {
    console.log("[transcription_notice] GNANI_API_KEY is not configured or placeholder, using fallback transcriber.");
    return null;
  }

  try {
    // Gnani.ai ASR API invocation
    // Typically accepts binary audio stream or multipart form-data
    const effectiveMime = mimeType.split(";")[0].trim();
    const endpoint = process.env.GNANI_API_ENDPOINT || "https://asr.gnani.ai/v1/recognize";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "token": apiKey,
        "Content-Type": effectiveMime,
        "x-language-code": "en-IN",
      },
      body: audioBuffer,
      signal: AbortSignal.timeout(12000), // 12s timeout for fast responsiveness
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn(`[transcription_notice] Gnani.ai returned HTTP ${response.status}: ${errText.substring(0, 200)}`);
      return null;
    }

    const data: any = await response.json();
    const transcript = (
      data.transcript ||
      data.asr_output ||
      data.text ||
      data.results?.[0]?.transcript ||
      data.data?.transcript ||
      ""
    ).trim();

    if (!transcript) {
      console.warn("[transcription_notice] Gnani.ai returned empty transcript.");
      return null;
    }

    const words = transcript.split(/\s+/).filter(Boolean);
    console.log(`[transcription_completed] Gnani.ai transcribed ${words.length} words successfully.`);

    return {
      transcript,
      confidence: typeof data.confidence === "number" ? data.confidence : 0.9,
      wordCount: words.length,
      duration: data.duration || undefined,
      provider: "gnani",
      raw: data,
    };
  } catch (err: any) {
    console.warn("[transcription_notice] Gnani.ai API call encountered an issue:", err.message || err);
    return null;
  }
}
