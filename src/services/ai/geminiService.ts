import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ override: true });

export interface SpeechObservationItem {
  type: "pause" | "possible_repetition" | "possible_prolongation" | "pacing" | "general";
  description: string;
}

export interface GeminiSpeechAnalysisResult {
  sessionSummary: string;
  practiceFocus: string;
  recommendedExercise: string;
  recommendedDurationMinutes: number;
  patientFeedback: string;
  slpSummary: string;
  recommendationReason: string;
  observations: SpeechObservationItem[];
  confidence: number;
  modelUsed: string;
}

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
        retryOptions: { attempts: 3 },
      },
    })
  : null;

const GEMINI_ANALYSIS_MODELS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
];

/**
 * Deep Speech Analysis & Recommendation using Gemini.
 * Evaluates speech pacing, acoustic metrics, Groq fast language extractions,
 * and produces personalized, non-diagnostic practice recommendations.
 */
export async function analyzeSpeechWithGemini(params: {
  transcript: string;
  groqOutput?: {
    cleaned_transcript?: string;
    word_count?: number;
    possible_repetition_mentions?: number;
    pause_mentions?: number;
    processing_summary?: string;
  } | null;
  duration: number;
  speechRate?: number;
  repetitions?: number;
  pauses?: number;
  prolongations?: number;
  practiceLevel?: string;
  priorContext?: string;
  exerciseTitle?: string | null;
}): Promise<GeminiSpeechAnalysisResult> {
  console.log(`[gemini_analysis_started] Gemini deep reasoning initiated (duration: ${params.duration}s, WPM: ${params.speechRate || 0})`);

  const effectiveTranscript = params.groqOutput?.cleaned_transcript || params.transcript || "Speech practice recording";
  const repCount = params.repetitions ?? params.groqOutput?.possible_repetition_mentions ?? 0;
  const pauseCount = params.pauses ?? params.groqOutput?.pause_mentions ?? 0;
  const prolCount = params.prolongations ?? 0;
  const rateWpm = params.speechRate || 0;

  const systemInstruction = `You are a clinical speech observation and supportive practice recommendation assistant for SpeakEase.

CORE CLINICAL SAFETY RULES:
1. SpeakEase is NOT a diagnostic system. You must NEVER diagnose stuttering/stammering severity or any speech disorder.
2. NEVER claim that the patient has or does not have a disorder, is cured, or is worsening.
3. NEVER replace a Speech-Language Pathologist (SLP).
4. Always use objective, supportive, non-diagnostic terms: "possible repetition", "observed pause", "speech practice observation", "AI-assisted observation", "your next practice focus".
5. Core principle: "AI assists. Humans validate. Clinicians decide."`;

  const prompt = `Analyze this patient practice session:
- Spoken Transcript: "${effectiveTranscript}"
- Fast Processing Summary: "${params.groqOutput?.processing_summary || 'N/A'}"
- Audio Duration: ${params.duration} seconds
- Word Count: ${params.groqOutput?.word_count || 0}
- Speech Rate: ${rateWpm} WPM
- Possible Repetitions Observed: ${repCount}
- Observed Pauses: ${pauseCount}
- Possible Prolongations: ${prolCount}
- Practice Level: ${params.practiceLevel || 'Developing'}
- Historical Context: ${params.priorContext || 'Initial practice session'}
${params.exerciseTitle ? `- Completed Routine: ${params.exerciseTitle}` : '- Routine: Free Speech Reading Practice'}

AVAILABLE STANDARD PRACTICE EXERCISES TO RECOMMEND:
1. "Easy Onset & Gentle Voicing" (Best for: vocal tension reduction, smooth phrase initiation, gentle breath support)
2. "Prolonged Vowel Phonation" (Best for: continuous breath control, steady tone, relaxed vocal tract)
3. "Diadochokinetic (DDK) Rate Test" (Best for: articulatory coordination, rhythm, rapid motor control)

TASK:
Generate a structured analysis providing supportive patient feedback, next practice recommendation, and an objective clinician summary.

Return a valid JSON object matching this schema:
{
  "sessionSummary": "<1-2 sentence concise summary of pacing and speech flow>",
  "practiceFocus": "<short focus name, e.g. 'Smooth Pacing', 'Gentle Onset', 'Steady Breath Control', 'Rhythmic Phrasing'>",
  "recommendedExercise": "<one of: 'Easy Onset & Gentle Voicing', 'Prolonged Vowel Phonation', 'Diadochokinetic (DDK) Rate Test'>",
  "recommendedDurationMinutes": <suggested minutes, e.g. 2, 3, or 5>,
  "patientFeedback": "<encouraging, friendly, supportive message for the patient>",
  "slpSummary": "<objective, cautious observation narrative for the SLP noting speech rate and hesitations without clinical diagnostic claims>",
  "recommendationReason": "<short explanation why this next practice routine is helpful based on session observations>",
  "observations": [
    {
      "type": "pause | possible_repetition | possible_prolongation | pacing",
      "description": "<specific objective observation>"
    }
  ],
  "confidence": <number between 0.70 and 0.95>
}`;

  if (ai) {
    for (const model of GEMINI_ANALYSIS_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
          },
        });

        const text = response.text;
        if (text && text.trim().length > 0) {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);

          console.log(`[gemini_analysis_completed] Gemini analysis completed via ${model}. Recommended exercise: "${parsed.recommendedExercise || 'Easy Onset & Gentle Voicing'}"`);

          return {
            sessionSummary: parsed.sessionSummary || "The session showed steady pacing with comfortable phrasing.",
            practiceFocus: parsed.practiceFocus || "Smooth Pacing",
            recommendedExercise: sanitizeExerciseName(parsed.recommendedExercise),
            recommendedDurationMinutes: Number(parsed.recommendedDurationMinutes) || 3,
            patientFeedback: parsed.patientFeedback || "Good effort. Try maintaining a comfortable and steady pace during your next practice.",
            slpSummary: parsed.slpSummary || "The session showed measured speech pacing. No clinical diagnosis should be inferred from this automated analysis.",
            recommendationReason: parsed.recommendationReason || "Continuing with gentle onset exercises helps build steady breath support and smooth phrasing.",
            observations: Array.isArray(parsed.observations) ? parsed.observations : [
              { type: "pacing", description: `Recorded speech rate of approximately ${rateWpm} WPM.` }
            ],
            confidence: typeof parsed.confidence === "number" ? Math.min(0.99, Math.max(0.5, parsed.confidence)) : 0.85,
            modelUsed: model,
          };
        }
      } catch (err: any) {
        console.warn(`[gemini_analysis_notice] Model ${model} fallback:`, err.message || err);
      }
    }
  }

  // Resilient deterministic fallback ensuring zero user interruption
  console.log("[gemini_analysis_completed] Using deterministic clinical recommendation fallback.");
  return getDeterministicFallbackAnalysis(effectiveTranscript, rateWpm, repCount, pauseCount, prolCount);
}

function sanitizeExerciseName(name?: string): string {
  if (!name) return "Easy Onset & Gentle Voicing";
  const lower = name.toLowerCase();
  if (lower.includes("vowel") || lower.includes("prolonged") || lower.includes("phonation")) {
    return "Prolonged Vowel Phonation";
  }
  if (lower.includes("ddk") || lower.includes("diadochokinetic") || lower.includes("rate test")) {
    return "Diadochokinetic (DDK) Rate Test";
  }
  return "Easy Onset & Gentle Voicing";
}

function getDeterministicFallbackAnalysis(
  transcript: string,
  rateWpm: number,
  repetitions: number,
  pauses: number,
  prolongations: number
): GeminiSpeechAnalysisResult {
  let recommended = "Easy Onset & Gentle Voicing";
  let focus = "Smooth Pacing";
  let reason = "Your recent practice showed natural pacing. This routine helps maintain comfortable breath flow and gentle vocal onsets.";

  if (repetitions > 1 || prolongations > 0) {
    recommended = "Easy Onset & Gentle Voicing";
    focus = "Gentle Vocal Onset";
    reason = "Taking time to gently ease into each word with soft exhalation helps keep speaking relaxed and fluid.";
  } else if (pauses >= 4) {
    recommended = "Prolonged Vowel Phonation";
    focus = "Continuous Breath Support";
    reason = "Practicing sustained vowel sounds helps strengthen steady breath coordination between phrases.";
  } else if (rateWpm > 0 && (rateWpm < 90 || rateWpm > 165)) {
    recommended = "Diadochokinetic (DDK) Rate Test";
    focus = "Motor Coordination & Rhythm";
    reason = "Targeting syllable transitions helps calibrate a comfortable, natural speaking pace.";
  }

  const repText = repetitions > 0 ? `${repetitions} possible repetition(s)` : "steady syllable flow";
  const pauseText = pauses > 0 ? `${pauses} observed pause(s)` : "continuous phrasing";

  return {
    sessionSummary: `Practice recorded at approximately ${rateWpm > 0 ? rateWpm : 110} WPM with ${pauseText} and ${repText}.`,
    practiceFocus: focus,
    recommendedExercise: recommended,
    recommendedDurationMinutes: 3,
    patientFeedback: "Great effort on this practice session. Keeping a calm breath rhythm will help support comfortable, steady speech.",
    slpSummary: `Acoustic analysis recorded speech rate of ${rateWpm} WPM with ${repetitions} possible repetitions and ${pauses} pauses. Automated observation for clinical review.`,
    recommendationReason: reason,
    observations: [
      { type: "pacing", description: `Calculated speech pace of ~${rateWpm} WPM.` },
      ...(pauses > 0 ? [{ type: "pause" as const, description: `${pauses} pauses or hesitations observed.` }] : []),
      ...(repetitions > 0 ? [{ type: "possible_repetition" as const, description: `${repetitions} possible repetitions noted.` }] : []),
    ],
    confidence: 0.82,
    modelUsed: "deterministic-engine",
  };
}
