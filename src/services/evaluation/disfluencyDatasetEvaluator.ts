/**
 * Development-only evaluation against the public DisfluencySpeech validation split.
 * Research samples and labels are never written to clinical records.
 */

import { transcribeAudioWithGroqWhisper } from "../ai/groqService";
import { fallbackGeminiTranscription } from "../ai/speechAnalysisPipeline";
import type {
  DatasetInfo,
  DetectedDisfluency,
  DisfluencySample,
  EvaluationReport,
  ParsedGroundTruthDisfluencies,
  SampleEvaluationResult,
} from "../../types/evaluation";
import { DISFLUENCY_SPEECH_METADATA } from "../../types/evaluation";

export { DISFLUENCY_SPEECH_METADATA };
export type {
  DatasetInfo,
  DetectedDisfluency,
  DisfluencySample,
  EvaluationReport,
  ParsedGroundTruthDisfluencies,
  SampleEvaluationResult,
};

type EditOperation = "match" | "substitution" | "deletion" | "insertion";

export function calculateWER(reference: string, hypothesis: string): {
  wer: number | null;
  substitutions: number;
  deletions: number;
  insertions: number;
  refCount: number;
} {
  const tokenize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/[^\p{L}\p{N}'\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);

  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  const costs = Array.from({ length: ref.length + 1 }, () =>
    new Array<number>(hyp.length + 1).fill(0),
  );
  const operations: EditOperation[][] = Array.from({ length: ref.length + 1 }, () =>
    new Array<EditOperation>(hyp.length + 1).fill("match"),
  );

  for (let i = 1; i <= ref.length; i++) {
    costs[i][0] = i;
    operations[i][0] = "deletion";
  }
  for (let j = 1; j <= hyp.length; j++) {
    costs[0][j] = j;
    operations[0][j] = "insertion";
  }

  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        costs[i][j] = costs[i - 1][j - 1];
        operations[i][j] = "match";
        continue;
      }

      const substitutionCost = costs[i - 1][j - 1] + 1;
      const deletionCost = costs[i - 1][j] + 1;
      const insertionCost = costs[i][j - 1] + 1;
      const minimumCost = Math.min(substitutionCost, deletionCost, insertionCost);
      costs[i][j] = minimumCost;
      operations[i][j] =
        minimumCost === substitutionCost
          ? "substitution"
          : minimumCost === deletionCost
            ? "deletion"
            : "insertion";
    }
  }

  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let i = ref.length;
  let j = hyp.length;
  while (i > 0 || j > 0) {
    const operation = operations[i][j];
    if (operation === "match" || operation === "substitution") {
      if (operation === "substitution") substitutions++;
      i--;
      j--;
    } else if (operation === "deletion") {
      deletions++;
      i--;
    } else {
      insertions++;
      j--;
    }
  }

  const refCount = ref.length;
  const wer = refCount === 0
    ? null
    : Number(((substitutions + deletions + insertions) / refCount).toFixed(4));

  return { wer, substitutions, deletions, insertions, refCount };
}

function cleanAnnotationText(text: string): string {
  let cleaned = text.replace(/\{[A-Z]\s*([^}]*)\}/gi, "$1").replace(/<([^>]+)>/g, "$1");
  while (/\[[^\[\]]*\]/.test(cleaned)) {
    cleaned = cleaned.replace(/\[([^\[\]]*)\]/g, "$1");
  }
  return cleaned.replace(/\[\]|\+/g, " ").replace(/\s+/g, " ").trim();
}

export function parseDisfluencyAnnotations(annotated: string): ParsedGroundTruthDisfluencies {
  const filledPauses = Array.from(annotated.matchAll(/\{F\s+([^}]+)\}/gi), ([, value]) =>
    cleanAnnotationText(value),
  ).filter(Boolean);
  const discourseMarkers = Array.from(annotated.matchAll(/\{D\s+([^}]+)\}/gi), ([, value]) =>
    cleanAnnotationText(value),
  ).filter(Boolean);
  const coordinatingConjunctions = Array.from(
    annotated.matchAll(/\{C\s+([^}]+)\}/gi),
    ([, value]) => cleanAnnotationText(value),
  ).filter(Boolean);
  const nonSpeechEvents = Array.from(annotated.matchAll(/<([^>]+)>/g), ([, value]) =>
    value.trim(),
  ).filter(Boolean);

  const restarts: ParsedGroundTruthDisfluencies["restarts"] = [];
  const stack: Array<{ start: number; separator: number | null }> = [];
  for (let index = 0; index < annotated.length; index++) {
    const character = annotated[index];
    if (character === "[") {
      stack.push({ start: index, separator: null });
    } else if (character === "+" && stack.length > 0 && stack[stack.length - 1].separator === null) {
      stack[stack.length - 1].separator = index;
    } else if (character === "]" && stack.length > 0) {
      const group = stack.pop()!;
      if (group.separator !== null) {
        const reparandum = cleanAnnotationText(annotated.slice(group.start + 1, group.separator));
        const repair = cleanAnnotationText(annotated.slice(group.separator + 1, index));
        restarts.push({
          raw: annotated.slice(group.start, index + 1),
          reparandum,
          repair,
        });
      }
    }
  }

  return {
    filledPauses,
    discourseMarkers,
    coordinatingConjunctions,
    restarts,
    nonSpeechEvents,
    totalCount:
      filledPauses.length + discourseMarkers.length + restarts.length + nonSpeechEvents.length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredTranscript(row: Record<string, unknown>, field: string, rowIndex: number): string {
  const value = row[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Hugging Face validation row ${rowIndex} is missing required ${field} ground truth.`);
  }
  return value;
}

function parseAudioField(value: unknown, rowIndex: number): { url: string; contentType: string } {
  const audioItem = Array.isArray(value) ? value[0] : value;
  if (!isRecord(audioItem) || typeof audioItem.src !== "string") {
    throw new Error(`Hugging Face validation row ${rowIndex} has an unsupported audio field.`);
  }

  let url: URL;
  try {
    url = new URL(audioItem.src);
  } catch {
    throw new Error(`Hugging Face validation row ${rowIndex} has an invalid audio URL.`);
  }
  if (url.protocol !== "https:" || url.hostname !== "datasets-server.huggingface.co") {
    throw new Error(`Hugging Face validation row ${rowIndex} has an untrusted audio URL.`);
  }

  return {
    url: url.toString(),
    contentType: typeof audioItem.type === "string" ? audioItem.type : "audio/wav",
  };
}

export async function fetchLiveValidationSamples(limit = 5): Promise<DisfluencySample[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error("Sample limit must be an integer between 1 and 10.");
  }

  const url = new URL("https://datasets-server.huggingface.co/rows");
  url.search = new URLSearchParams({
    dataset: "amaai-lab/DisfluencySpeech",
    config: "default",
    split: "validation",
    offset: "0",
    length: String(limit),
  }).toString();

  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (response.ok) break;
    const canRetry = response.status === 429 || response.status >= 500;
    if (!canRetry || attempt === 2) {
      throw new Error(`Hugging Face Datasets Server returned HTTP ${response.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  if (!response?.ok) throw new Error("Hugging Face Datasets Server returned no usable response.");

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.rows)) {
    throw new Error("Hugging Face Datasets Server returned an unsupported rows response.");
  }
  if (payload.rows.length === 0) {
    throw new Error("Hugging Face validation split returned no samples.");
  }

  return payload.rows.map((entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.row)) {
      throw new Error(`Hugging Face validation row ${index} has an unsupported schema.`);
    }

    const row = entry.row;
    const rowIndex = typeof entry.row_idx === "number" ? entry.row_idx : index;
    const annotated = requiredTranscript(row, "transcript_annotated", rowIndex);
    const audio = parseAudioField(row.audio, rowIndex);

    return {
      id: `hf-disfluency-validation-${rowIndex}`,
      split: "validation",
      transcript_annotated: annotated,
      transcript_a: requiredTranscript(row, "transcript_a", rowIndex),
      transcript_b: requiredTranscript(row, "transcript_b", rowIndex),
      transcript_c: requiredTranscript(row, "transcript_c", rowIndex),
      audioUrl: audio.url,
      audioContentType: audio.contentType,
      groundTruth: parseDisfluencyAnnotations(annotated),
    };
  });
}

function normalizeEventText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FILLED_PAUSE_PATTERN = /\b(?:uh+|um+|erm?|er+|ah+|hmm+|mm-hm)\b/gi;
const DISCOURSE_MARKERS = ["you know", "i mean", "i guess", "i think", "well", "see", "oh", "so", "actually", "like"];
const NON_SPEECH_TERMS = ["laughter", "laughing", "sigh", "sighing", "cough", "coughing", "lipsmack", "gasp"];

function findLexicalEvents(text: string, category: DetectedDisfluency["category"], terms: string[]) {
  const events: DetectedDisfluency[] = [];
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    for (const match of text.matchAll(regex)) {
      events.push({ category, text: match[0] });
    }
  }
  return events;
}

export function detectTranscriptDisfluencies(transcript: string): DetectedDisfluency[] {
  const events: DetectedDisfluency[] = Array.from(transcript.matchAll(FILLED_PAUSE_PATTERN), ([match]) => ({
    category: "filledPause",
    text: match,
  }));
  events.push(...findLexicalEvents(transcript, "discourseMarker", DISCOURSE_MARKERS));
  events.push(...findLexicalEvents(transcript, "nonSpeechEvent", NON_SPEECH_TERMS));

  const words = normalizeEventText(transcript).split(" ").filter(Boolean);
  for (let index = 0; index < words.length - 1; index++) {
    const maxLength = Math.min(8, Math.floor((words.length - index) / 2));
    for (let length = maxLength; length >= 1; length--) {
      const first = words.slice(index, index + length);
      const second = words.slice(index + length, index + length * 2);
      if (first.join(" ") === second.join(" ")) {
        events.push({ category: "restart", text: first.join(" ") });
        index += length * 2 - 1;
        break;
      }
    }
  }

  return events;
}

export function scoreDisfluencies(
  groundTruth: ParsedGroundTruthDisfluencies,
  detected: DetectedDisfluency[],
): { tp: number; fp: number; fn: number; precision: number | null; recall: number | null; f1: number | null } {
  const expected = [
    ...groundTruth.filledPauses.map((text) => ({ category: "filledPause" as const, text })),
    ...groundTruth.discourseMarkers.map((text) => ({ category: "discourseMarker" as const, text })),
    ...groundTruth.restarts.map(({ repair }) => ({ category: "restart" as const, text: repair })),
    ...groundTruth.nonSpeechEvents.map((text) => ({ category: "nonSpeechEvent" as const, text })),
  ];
  const matched = new Set<number>();
  let tp = 0;

  for (const prediction of detected) {
    const targetIndex = expected.findIndex(
      (target, index) =>
        !matched.has(index) &&
        target.category === prediction.category &&
        normalizeEventText(target.text) === normalizeEventText(prediction.text),
    );
    if (targetIndex >= 0) {
      matched.add(targetIndex);
      tp++;
    }
  }

  const fp = detected.length - tp;
  const fn = expected.length - tp;
  const precision = tp + fp === 0 ? null : Number((tp / (tp + fp)).toFixed(4));
  const recall = tp + fn === 0 ? null : Number((tp / (tp + fn)).toFixed(4));
  const f1Denominator = 2 * tp + fp + fn;
  const f1 = f1Denominator === 0 ? null : Number(((2 * tp) / f1Denominator).toFixed(4));
  return { tp, fp, fn, precision, recall, f1 };
}

let cachedEvaluationReport: EvaluationReport | null = null;

export async function runDisfluencyEvaluation(sampleLimit = 5): Promise<EvaluationReport> {
  const samples = await fetchLiveValidationSamples(sampleLimit);
  const results: SampleEvaluationResult[] = [];
  let editErrorsRawA = 0;
  let editErrorsFluentC = 0;
  let referenceWordsRawA = 0;
  let referenceWordsFluentC = 0;
  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;

  for (const sample of samples) {
    const audioResponse = await fetch(sample.audioUrl, { signal: AbortSignal.timeout(20000) });
    if (!audioResponse.ok) {
      throw new Error(`Could not fetch dataset audio for ${sample.id} (HTTP ${audioResponse.status}).`);
    }
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    if (audioBuffer.length === 0) {
      throw new Error(`Dataset audio for ${sample.id} was empty.`);
    }

    const contentType = audioResponse.headers.get("content-type") || sample.audioContentType;
    const groqResult = await transcribeAudioWithGroqWhisper(audioBuffer, contentType);
    const geminiResult = groqResult?.transcript
      ? null
      : await fallbackGeminiTranscription(audioBuffer, contentType);
    const hypothesisTranscript = groqResult?.transcript?.trim() || geminiResult?.transcript?.trim() || "";
    if (!hypothesisTranscript) {
      throw new Error(
        `No speech transcription was produced for ${sample.id}. Configure GROQ_API_KEY or GEMINI_API_KEY; reference text is never substituted for a prediction.`,
      );
    }

    const werA = calculateWER(sample.transcript_a, hypothesisTranscript);
    const werC = calculateWER(sample.transcript_c, hypothesisTranscript);
    if (werA.wer === null || werC.wer === null) {
      throw new Error(`Ground-truth transcripts for ${sample.id} contain no reference words.`);
    }
    editErrorsRawA += werA.substitutions + werA.deletions + werA.insertions;
    editErrorsFluentC += werC.substitutions + werC.deletions + werC.insertions;
    referenceWordsRawA += werA.refCount;
    referenceWordsFluentC += werC.refCount;

    const detectedDisfluencies = detectTranscriptDisfluencies(hypothesisTranscript);
    const scores = scoreDisfluencies(sample.groundTruth, detectedDisfluencies);
    totalTp += scores.tp;
    totalFp += scores.fp;
    totalFn += scores.fn;

    results.push({
      sampleId: sample.id,
      referenceTextA: sample.transcript_a,
      referenceTextC: sample.transcript_c,
      hypothesisTranscript,
      werVsRawA: werA.wer,
      werVsFluentC: werC.wer,
      groundTruthDisfluencies: sample.groundTruth,
      detectedDisfluencies,
      ...scores,
      timestampStatus: "UNAVAILABLE_IN_TABULAR_SCHEMA",
      observations: [
        groqResult?.transcript
          ? "Hypothesis transcribed from dataset audio with Groq Whisper."
          : "Hypothesis transcribed from dataset audio with Gemini fallback.",
        "Event metrics use exact lexical matches between detected transcript events and annotated ground truth; they are not acoustic timestamp scores.",
      ],
    });
  }

  const overallPrecision =
    totalTp + totalFp === 0 ? null : Number((totalTp / (totalTp + totalFp)).toFixed(4));
  const overallRecall =
    totalTp + totalFn === 0 ? null : Number((totalTp / (totalTp + totalFn)).toFixed(4));
  const overallF1Denominator = 2 * totalTp + totalFp + totalFn;
  const overallF1 =
    overallF1Denominator === 0 ? null : Number(((2 * totalTp) / overallF1Denominator).toFixed(4));

  const report: EvaluationReport = {
    timestamp: new Date().toISOString(),
    dataset: "amaai-lab/DisfluencySpeech (Hugging Face)",
    sampleCount: results.length,
    aggregateMetrics: {
      corpusWerRawA: Number((editErrorsRawA / referenceWordsRawA).toFixed(4)),
      corpusWerFluentC: Number((editErrorsFluentC / referenceWordsFluentC).toFixed(4)),
      overallPrecision,
      overallRecall,
      overallF1,
      totalReferenceWordsRawA: referenceWordsRawA,
      totalReferenceWordsFluentC: referenceWordsFluentC,
      totalGroundTruthDisfluencies: totalTp + totalFn,
      totalDetectedEvents: totalTp + totalFp,
      totalTruePositives: totalTp,
      totalFalsePositives: totalFp,
      totalFalseNegatives: totalFn,
    },
    sampleResults: results,
    datasetAssessment: {
      speechNature: "Single-speaker studio recreation of Switchboard-1 telephone speech utterances.",
      suitableForEvaluation: true,
      suitableForPatientPractice: false,
      practiceLibraryRecommendation:
        "Do not use these research samples for patient practice. Keep the curated therapeutic practice library separate.",
    },
    safetyNotice:
      "DEVELOPMENT & ML EVALUATION ONLY. Research samples and metrics are isolated from clinical session data and patient-facing flows.",
  };

  cachedEvaluationReport = report;
  return report;
}

export function getLatestEvaluationReport(): EvaluationReport | null {
  return cachedEvaluationReport;
}
