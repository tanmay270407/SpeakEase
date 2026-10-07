import { spawnSync } from "child_process";
import { GoogleGenAI } from "@google/genai";
import { transcribeAudioWithGnani } from "./gnaniService";
import { processTranscriptWithGroq } from "./groqService";
import { analyzeSpeechWithGemini, GeminiSpeechAnalysisResult } from "./geminiService";

export interface SpeechAnalysisPipelineInput {
  sessionId: string;
  user: { id: string; email?: string };
  audioBuffer: Buffer;
  mimeType: string;
  sessionInfo: {
    id?: string;
    duration?: number;
    exercise_id?: string | null;
    user_id?: string;
  };
  supabase: any;
  pool?: any;
  isRetry?: boolean;
}

export interface SpeechAnalysisPipelineOutput {
  success: boolean;
  sessionId: string;
  transcript: string;
  speechMetrics: {
    speechRate: number;
    pauses: number;
    possibleRepetitions: number;
    possibleProlongations: number;
  };
  aiAnalysis: {
    summary: string;
    practiceFocus: string;
    recommendedExercise: string;
    recommendedDuration: number;
    patientFeedback: string;
    slpSummary: string;
    recommendationReason: string;
    observations: Array<{ type: string; description: string }>;
    confidence: number;
    aiModel: string;
    processingModel: string;
    transcriptionProvider: string;
  };
  practiceLevel: string;
  observation: string;
}

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: { "User-Agent": "aistudio-build" },
        retryOptions: { attempts: 3 },
      },
    })
  : null;

function normalizeCount(val: any): number {
  if (val === null || val === undefined) return 0;
  if (Array.isArray(val)) return val.length;
  if (typeof val === "number") return isNaN(val) ? 0 : Math.max(0, Math.round(val));
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : Math.max(0, Math.round(parsed));
  }
  return 0;
}

function calculatePracticeLevel(metrics?: {
  repetitions?: number | null;
  pauses?: number | null;
  prolongations?: number | null;
  speech_rate?: number | string | null;
} | null): { level: string; score: number; description: string } {
  if (!metrics) {
    return { level: "Developing", score: 2, description: "Based on this practice session." };
  }
  const rep = Number(metrics.repetitions) || 0;
  const pause = Number(metrics.pauses) || 0;
  const prol = Number(metrics.prolongations) || 0;
  const rate = Number(metrics.speech_rate) || 0;

  let score = 4;
  if (rep >= 4 || prol >= 3) {
    score -= 2;
  } else if (rep >= 2 || prol >= 1) {
    score -= 1;
  }
  if (pause >= 6) {
    score -= 1;
  }
  if (rate > 0 && (rate < 80 || rate > 175)) {
    score -= 1;
  }
  score = Math.max(1, Math.min(4, score));

  switch (score) {
    case 4:
      return { level: "Strong Progress", score: 4, description: "Steady pacing and smooth speech flow observed." };
    case 3:
      return { level: "Good Progress", score: 3, description: "Good speech control with minor hesitations observed." };
    case 2:
      return { level: "Developing", score: 2, description: "Consistent practice will help build pacing and reduce pauses." };
    case 1:
    default:
      return { level: "Needs Practice", score: 1, description: "Focus on relaxed breathing and taking your time between sentences." };
  }
}

/**
 * Fallback Gemini Audio Transcriber if Gnani is not available
 */
async function fallbackGeminiTranscription(audioBuffer: Buffer, mimeType: string) {
  if (!ai) return null;
  const base64Audio = audioBuffer.toString("base64");
  const effectiveMime = mimeType ? mimeType.split(";")[0].trim() : "audio/webm";

  const sttPrompt = `You are an acoustic speech-to-text analyzer for SpeakEase speech practice.
Analyze the audio and return valid JSON:
{
  "transcript": "<verbatim spoken words or empty string>",
  "speechRate": <approximate WPM number, e.g. 110>,
  "repetitions": <count of repeated sounds, syllables, or words>,
  "pauses": <count of distinct hesitations or gaps>,
  "prolongations": <count of elongated vowel/consonant sounds>
}`;

  for (const model of ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-3.5-transcribe", "gemini-3.1-flash-lite"]) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: sttPrompt },
              { inlineData: { mimeType: effectiveMime, data: base64Audio } },
            ],
          },
        ],
        config: model.includes("transcribe") ? {} : { responseMimeType: "application/json" },
      });

      const text = response.text;
      if (text && text.trim().length > 0) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
        return {
          transcript: parsed.transcript || "",
          speechRate: parsed.speechRate || 100,
          repetitions: parsed.repetitions || 0,
          pauses: parsed.pauses || 0,
          prolongations: parsed.prolongations || 0,
        };
      }
    } catch (err: any) {
      console.warn(`[transcription_notice] Gemini model ${model} fallback:`, err.message || err);
    }
  }
  return null;
}

/**
 * Central Orchestration Service for the SpeakEase Multi-AI Processing Pipeline:
 * PATIENT VOICE -> GNANI.AI (Voice-to-Text) -> GROQ (Fast Processing) -> GEMINI (Deep Analysis & Next Practice) -> SUPABASE
 */
export async function runSpeechAnalysisPipeline({
  sessionId,
  user,
  audioBuffer,
  mimeType,
  sessionInfo,
  supabase,
  pool,
  isRetry = false,
}: SpeechAnalysisPipelineInput): Promise<SpeechAnalysisPipelineOutput> {
  console.log(`[PIPELINE_START] Beginning Multi-AI processing pipeline for session ${sessionId}`);

  // STAGE 1: AUDIO VALIDATION & SECURE PERSISTENCE
  if (!audioBuffer || audioBuffer.length === 0) {
    console.error(`[ai_pipeline_failed] Audio buffer is empty for session ${sessionId}`);
    throw new Error("AUDIO_RETRIEVAL_FAILED: Audio buffer is empty or missing.");
  }

  // Update session status to processing
  try {
    await supabase.from("sessions").update({ analysis_status: "processing" }).eq("id", sessionId);
    if (pool) {
      await pool.query("UPDATE sessions SET analysis_status = 'processing' WHERE id = $1", [sessionId]);
    }
  } catch (statusErr: any) {
    console.warn("Could not set processing status:", statusErr.message);
  }

  // Save raw audio to Postgres session_audio table and Supabase storage
  if (pool && !isRetry) {
    try {
      await pool.query(
        `INSERT INTO session_audio (session_id, audio_data, content_type) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (session_id) DO UPDATE SET audio_data = EXCLUDED.audio_data, content_type = EXCLUDED.content_type`,
        [sessionId, audioBuffer, mimeType || "audio/webm"]
      );

      // Verify saved audio
      const verifyRes = await pool.query(
        "SELECT octet_length(audio_data) as len FROM session_audio WHERE session_id = $1",
        [sessionId]
      );
      if (!verifyRes.rows.length || !verifyRes.rows[0].len || Number(verifyRes.rows[0].len) === 0) {
        throw new Error("AUDIO_STORAGE_FAILED: Verification of saved audio failed in database");
      }
      console.log(`[AUDIO_SAVED] Audio verified in database for session ${sessionId} (${verifyRes.rows[0].len} bytes)`);

      try {
        await supabase.storage.from("session_audio").upload(
          `${user.id}/${sessionId}.webm`,
          audioBuffer,
          { contentType: mimeType || "audio/webm", upsert: true }
        );
      } catch (storageErr: any) {
        console.warn("Supabase storage sync notice:", storageErr.message);
      }
    } catch (audioErr: any) {
      console.error("[AUDIO_STORAGE_FAILED]:", audioErr.message);
      throw audioErr;
    }
  }

  // Determine Authoritative Duration
  let authoritativeDuration = sessionInfo.duration || 0;
  try {
    const probeResult = spawnSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      "-"
    ], { input: audioBuffer, timeout: 5000 });
    const out = probeResult.stdout?.toString().trim();
    const durSec = parseFloat(out);
    if (!isNaN(durSec) && durSec > 0) {
      authoritativeDuration = durSec < 1 ? 1 : Math.round(durSec);
    }
  } catch (ffErr: any) {
    console.warn("ffprobe inspection notice:", ffErr.message);
  }

  if (authoritativeDuration <= 0) authoritativeDuration = 1;

  // STAGE 2: VOICE-TO-TEXT (GNANI.AI PRIMARY)
  let transcript = "";
  let transcriptionProvider = "gnani";
  let fallbackAcoustics: any = null;

  const gnaniResult = await transcribeAudioWithGnani(audioBuffer, mimeType);
  if (gnaniResult && gnaniResult.transcript) {
    transcript = gnaniResult.transcript;
    transcriptionProvider = "gnani";
  } else {
    // Graceful fallback to Gemini speech transcription
    console.log(`[transcription_notice] Engaging resilient Gemini acoustic transcriber for session ${sessionId}`);
    fallbackAcoustics = await fallbackGeminiTranscription(audioBuffer, mimeType);
    transcript = fallbackAcoustics?.transcript || "";
    transcriptionProvider = "gemini-fallback";
  }

  // Calculate Speech Rate & Acoustic Indicators
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  let calculatedWpm = fallbackAcoustics?.speechRate || 0;
  if (!calculatedWpm || calculatedWpm <= 0) {
    const minutes = authoritativeDuration / 60;
    calculatedWpm = minutes > 0 ? Math.round(wordCount / minutes) : 0;
  }
  if (calculatedWpm === 0 && wordCount > 0) {
    calculatedWpm = Math.min(140, Math.max(60, wordCount * 12));
  }

  // STAGE 3: FAST PROCESSING LAYER (GROQ)
  let groqResult = await processTranscriptWithGroq(transcript, {
    repetitions: fallbackAcoustics?.repetitions || 0,
    pauses: fallbackAcoustics?.pauses || 0,
    speech_rate: calculatedWpm,
  });

  const processingModel = groqResult?.provider === "groq" ? "groq/llama-3.3-70b" : "fast-parser";

  // STAGE 4: HISTORICAL PATIENT CONTEXT
  let priorContext = "Baseline practice session (no prior recorded session).";
  try {
    const { data: priorSessions } = await supabase
      .from("sessions")
      .select("id, created_at, duration")
      .eq("user_id", user.id)
      .neq("id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (priorSessions && priorSessions.length > 0) {
      const { data: pMetrics } = await supabase
        .from("speech_metrics")
        .select("repetitions, pauses, prolongations, speech_rate, created_at")
        .eq("session_id", priorSessions[0].id)
        .maybeSingle();

      if (pMetrics) {
        priorContext = `Prior session on ${new Date(pMetrics.created_at).toLocaleDateString()}: Speech rate ${pMetrics.speech_rate || 0} wpm, repetitions ${pMetrics.repetitions ?? 0}, pauses ${pMetrics.pauses ?? 0}.`;
      }
    }
  } catch (priorErr: any) {
    console.warn("Could not load prior session context:", priorErr.message);
  }

  // Consolidate metrics
  const finalMetrics = {
    repetitions: normalizeCount(fallbackAcoustics?.repetitions ?? groqResult?.possible_repetition_mentions ?? 0),
    pauses: normalizeCount(fallbackAcoustics?.pauses ?? groqResult?.pause_mentions ?? 0),
    prolongations: normalizeCount(fallbackAcoustics?.prolongations ?? 0),
    speech_rate: normalizeCount(calculatedWpm),
  };

  const practiceLevelResult = calculatePracticeLevel(finalMetrics);

  // STAGE 5: DEEP REASONING & PERSONALIZED RECOMMENDATIONS (GEMINI)
  let exerciseTitle: string | null = null;
  if (sessionInfo.exercise_id) {
    try {
      const { data: exData } = await supabase.from("exercises").select("name").eq("id", sessionInfo.exercise_id).maybeSingle();
      if (exData?.name) exerciseTitle = exData.name;
    } catch (exErr: any) {
      console.warn("Could not fetch exercise title:", exErr.message);
    }
  }

  const geminiResult: GeminiSpeechAnalysisResult = await analyzeSpeechWithGemini({
    transcript,
    groqOutput: groqResult,
    duration: authoritativeDuration,
    speechRate: finalMetrics.speech_rate,
    repetitions: finalMetrics.repetitions,
    pauses: finalMetrics.pauses,
    prolongations: finalMetrics.prolongations,
    practiceLevel: practiceLevelResult.level,
    priorContext,
    exerciseTitle,
  });

  const observationText = geminiResult.slpSummary || geminiResult.sessionSummary;

  // STAGE 6: PERSISTENCE INTO SUPABASE & POSTGRES (SOURCE OF TRUTH)
  console.log(`[ai_analysis_saved] Persisting multi-AI results to Supabase for session ${sessionId}`);

  const aiAnalysisPayload = {
    summary: geminiResult.sessionSummary,
    practiceFocus: geminiResult.practiceFocus,
    recommendedExercise: geminiResult.recommendedExercise,
    recommendedDuration: geminiResult.recommendedDurationMinutes,
    patientFeedback: geminiResult.patientFeedback,
    slpSummary: geminiResult.slpSummary,
    recommendationReason: geminiResult.recommendationReason,
    observations: geminiResult.observations,
    confidence: geminiResult.confidence,
    aiModel: geminiResult.modelUsed,
    processingModel,
    transcriptionProvider,
  };

  if (pool) {
    // Upsert speech_metrics
    try {
      await pool.query(
        `INSERT INTO speech_metrics (session_id, repetitions, pauses, prolongations, speech_rate, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (session_id) DO UPDATE SET 
           repetitions = EXCLUDED.repetitions,
           pauses = EXCLUDED.pauses,
           prolongations = EXCLUDED.prolongations,
           speech_rate = EXCLUDED.speech_rate,
           created_at = NOW()`,
        [sessionId, finalMetrics.repetitions, finalMetrics.pauses, finalMetrics.prolongations, finalMetrics.speech_rate]
      );
    } catch (metricErr: any) {
      console.warn("speech_metrics fallback:", metricErr.message);
      await pool.query("DELETE FROM speech_metrics WHERE session_id = $1", [sessionId]);
      await pool.query(
        `INSERT INTO speech_metrics (session_id, repetitions, pauses, prolongations, speech_rate, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [sessionId, finalMetrics.repetitions, finalMetrics.pauses, finalMetrics.prolongations, finalMetrics.speech_rate]
      );
    }

    // Upsert ai_observations
    try {
      await pool.query(
        `INSERT INTO ai_observations (session_id, observation, observation_text, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (session_id) DO UPDATE SET 
           observation = EXCLUDED.observation,
           observation_text = EXCLUDED.observation_text,
           created_at = NOW()`,
        [sessionId, observationText, observationText]
      );
    } catch (obsErr: any) {
      console.warn("ai_observations fallback:", obsErr.message);
      await pool.query("DELETE FROM ai_observations WHERE session_id = $1", [sessionId]);
      await pool.query(
        `INSERT INTO ai_observations (session_id, observation, observation_text, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [sessionId, observationText, observationText]
      );
    }

    // Update sessions table
    await pool.query(
      `UPDATE sessions 
       SET review_status = CASE WHEN review_status = 'REVIEWED' THEN review_status ELSE 'READY_FOR_REVIEW' END, 
           analysis_status = 'completed', 
           practice_level = $1,
           analyzed_at = NOW(),
           duration = COALESCE($2, duration)
       WHERE id = $3`,
      [practiceLevelResult.level, authoritativeDuration, sessionId]
    );

    // Sync to corsair_entities & audit_logs
    try {
      const timestamp = new Date().toISOString();
      const accountId = "default";
      const metricEntityId = `metric_${sessionId}`;
      const metricPayload = {
        session_id: sessionId,
        repetitions: finalMetrics.repetitions,
        pauses: finalMetrics.pauses,
        prolongations: finalMetrics.prolongations,
        speech_rate: finalMetrics.speech_rate,
        practice_level: practiceLevelResult.level,
        observation: observationText,
        ai_analysis: aiAnalysisPayload,
        created_at: timestamp,
      };
      await pool.query(
        `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8;`,
        [metricEntityId, timestamp, timestamp, accountId, sessionId, "speech_metric", "1", JSON.stringify(metricPayload)]
      );

      await pool.query(
        "INSERT INTO audit_logs (event_type, description) VALUES ($1, $2)",
        [
          "WORKFLOW_EXECUTION",
          JSON.stringify({
            workflow: "Multi-AI Speech Analysis Pipeline",
            status: "Success",
            sessionId,
            metrics: finalMetrics,
            practice_level: practiceLevelResult.level,
            aiAnalysis: aiAnalysisPayload,
          }),
        ]
      );
    } catch (auditErr: any) {
      console.warn("Corsair sync notice:", auditErr.message);
    }
  } else {
    // Supabase JS SDK direct upsert
    await supabase.from("speech_metrics").upsert({
      session_id: sessionId,
      repetitions: finalMetrics.repetitions,
      pauses: finalMetrics.pauses,
      prolongations: finalMetrics.prolongations,
      speech_rate: finalMetrics.speech_rate,
    }, { onConflict: "session_id" });

    await supabase.from("ai_observations").upsert({
      session_id: sessionId,
      observation: observationText,
      observation_text: observationText,
    }, { onConflict: "session_id" });

    await supabase.from("sessions").update({
      review_status: "READY_FOR_REVIEW",
      analysis_status: "completed",
      practice_level: practiceLevelResult.level,
      analyzed_at: new Date().toISOString(),
      duration: authoritativeDuration,
    }).eq("id", sessionId);
  }

  console.log(`[PIPELINE_SUCCESS] Successfully analyzed and saved session ${sessionId}`);

  return {
    success: true,
    sessionId,
    transcript,
    speechMetrics: {
      speechRate: finalMetrics.speech_rate,
      pauses: finalMetrics.pauses,
      possibleRepetitions: finalMetrics.repetitions,
      possibleProlongations: finalMetrics.prolongations,
    },
    aiAnalysis: aiAnalysisPayload,
    practiceLevel: practiceLevelResult.level,
    observation: observationText,
  };
}
