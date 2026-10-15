import dotenv from "dotenv";
dotenv.config({ override: true });

export interface GroqFastProcessingResult {
  cleaned_transcript: string;
  word_count: number;
  possible_repetition_mentions: number;
  pause_mentions: number;
  processing_summary: string;
  provider: "groq" | "fallback";
}

export async function transcribeAudioWithGroqWhisper(
  audioBuffer: Buffer,
  mimeType: string = "audio/webm"
): Promise<{ transcript: string; wordCount: number; durationSec: number; speechRate: number } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "YOUR_GROQ_API_KEY") {
    return null;
  }
  console.log(`[groq_whisper_started] Groq Whisper-large-v3-turbo STT initiated (${audioBuffer.length} bytes)`);
  try {
    const effectiveMime = mimeType ? mimeType.split(";")[0].trim() : "audio/webm";
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: effectiveMime }), "recording.webm");
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("response_format", "verbose_json");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      console.warn(`[groq_whisper_notice] Groq Whisper returned HTTP ${response.status}`);
      return null;
    }

    const data: any = await response.json();
    const transcript = (data.text || "").trim();
    if (!transcript) return null;

    const durationSec = typeof data.duration === "number" && data.duration > 0 ? data.duration : 0;
    const words = transcript.split(/\s+/).filter(Boolean);
    const speechRate = durationSec > 0 ? Math.round((words.length / durationSec) * 60) : 0;

    console.log(`[groq_whisper_completed] Groq Whisper transcribed ${words.length} words successfully.`);
    return {
      transcript,
      wordCount: words.length,
      durationSec,
      speechRate,
    };
  } catch (err: any) {
    console.warn("[groq_whisper_notice] Groq Whisper error:", err.message || err);
    return null;
  }
}

/**
 * Groq Fast Processing Layer.
 * Performs fast language processing, transcript cleaning, word count extraction,
 * and preliminary hesitation detection to prepare structured context for Gemini.
 * Strictly non-diagnostic and computational only.
 */
export async function processTranscriptWithGroq(
  transcript: string,
  acousticMetrics?: {
    repetitions?: number;
    pauses?: number;
    speech_rate?: number;
  }
): Promise<GroqFastProcessingResult | null> {
  const apiKey = process.env.GROQ_API_KEY;
  console.log(`[groq_processing_started] Fast transcript structuring initiated for: "${transcript.substring(0, 60)}..."`);

  if (!transcript || transcript.trim().length === 0) {
    return {
      cleaned_transcript: "",
      word_count: 0,
      possible_repetition_mentions: 0,
      pause_mentions: 0,
      processing_summary: "No spoken transcript detected in this practice session.",
      provider: "fallback",
    };
  }

  if (!apiKey || apiKey.trim() === "" || apiKey === "YOUR_GROQ_API_KEY") {
    console.log("[groq_processing_notice] GROQ_API_KEY not configured, utilizing built-in fast parser.");
    return fallbackLocalParser(transcript, acousticMetrics);
  }

  try {
    const prompt = `You are a fast language processing engine for speech practice transcripts in SpeakEase.
Perform lightweight linguistic structuring on this transcript.

CRITICAL RULES:
- DO NOT make any medical or clinical diagnoses.
- DO NOT claim any speech disorder.
- Only perform fast computational language processing.

TRANSCRIPT:
"${transcript}"

ACOUSTIC HINTS (if any):
- Repetitions: ${acousticMetrics?.repetitions ?? 0}
- Pauses: ${acousticMetrics?.pauses ?? 0}
- Speech Rate: ${acousticMetrics?.speech_rate ?? 0} WPM

Return a valid JSON object with this exact structure:
{
  "cleaned_transcript": "<cleaned transcript with normalized punctuation and spacing>",
  "word_count": <integer word count>,
  "possible_repetition_mentions": <integer count of repeated words/syllables observed in text, e.g. 'I... I'>,
  "pause_mentions": <integer count of explicit hesitation indicators in text, e.g. ellipses '...'>,
  "processing_summary": "<short 1-sentence objective factual summary of transcript features>"
}`;

    const candidateModels = ["gemma2-9b-it", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
    let response: Response | null = null;

    for (const modelName of candidateModels) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              {
                role: "system",
                content: "You are a fast computational text processor. Respond only in valid JSON format.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 350,
          }),
          signal: AbortSignal.timeout(6000), // 6s fast timeout
        });

        if (res.ok) {
          response = res;
          break;
        } else {
          console.log(`[groq_processing_info] Groq model '${modelName}' returned status ${res.status}`);
        }
      } catch (e) {
        console.log(`[groq_processing_info] Groq request for '${modelName}' failed, trying fallback.`);
      }
    }

    if (!response || !response.ok) {
      console.log("[groq_processing_info] Groq API unavailable or model unsupported. Using local fast parser fallback.");
      return fallbackLocalParser(transcript, acousticMetrics);
    }

    const json: any = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return fallbackLocalParser(transcript, acousticMetrics);
    }

    const parsed = JSON.parse(content);
    console.log(`[groq_processing_completed] Groq fast structuring completed (${parsed.word_count || 0} words).`);

    return {
      cleaned_transcript: parsed.cleaned_transcript || transcript,
      word_count: typeof parsed.word_count === "number" ? parsed.word_count : transcript.split(/\s+/).filter(Boolean).length,
      possible_repetition_mentions: typeof parsed.possible_repetition_mentions === "number" ? parsed.possible_repetition_mentions : 0,
      pause_mentions: typeof parsed.pause_mentions === "number" ? parsed.pause_mentions : 0,
      processing_summary: parsed.processing_summary || "Transcript processed for clinical analysis.",
      provider: "groq",
    };
  } catch (err: any) {
    console.log("[groq_processing_info] Groq fast processing fallback executed:", err?.message || err);
    return fallbackLocalParser(transcript, acousticMetrics);
  }
}

function fallbackLocalParser(
  transcript: string,
  acousticMetrics?: { repetitions?: number; pauses?: number; speech_rate?: number }
): GroqFastProcessingResult {
  const words = transcript.split(/\s+/).filter(Boolean);
  
  // Fast regex-based repetition and pause mention detection
  let repCount = acousticMetrics?.repetitions ?? 0;
  const wordRepMatches = transcript.match(/\b(\w+)\s+\1\b/gi);
  if (wordRepMatches) {
    repCount = Math.max(repCount, wordRepMatches.length);
  }

  let pauseCount = acousticMetrics?.pauses ?? 0;
  const ellipsisMatches = transcript.match(/\.{2,}|\b(um|uh|er|ah)\b/gi);
  if (ellipsisMatches) {
    pauseCount = Math.max(pauseCount, ellipsisMatches.length);
  }

  const cleaned = transcript.replace(/\s+/g, " ").trim();

  let summary = `Transcript contains ${words.length} words.`;
  if (repCount > 0 && pauseCount > 0) {
    summary = `Transcript contains ${words.length} words with ${repCount} possible repetition(s) and ${pauseCount} observed pause(s).`;
  } else if (repCount > 0) {
    summary = `Transcript contains ${words.length} words with ${repCount} possible repeated word(s).`;
  } else if (pauseCount > 0) {
    summary = `Transcript contains ${words.length} words with ${pauseCount} observed pause(s).`;
  }

  return {
    cleaned_transcript: cleaned,
    word_count: words.length,
    possible_repetition_mentions: repCount,
    pause_mentions: pauseCount,
    processing_summary: summary,
    provider: "fallback",
  };
}
