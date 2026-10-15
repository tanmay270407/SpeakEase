/**
 * Evaluation Types and Metadata for DisfluencySpeech Dataset
 * Client-safe definitions (no Node.js/child_process imports)
 */

export interface DatasetInfo {
  name: string;
  repoId: string;
  license: string;
  paperTitle: string;
  arxivId: string;
  samplingRateHz: number;
  speechType: "recreated_studio_actor" | "genuine_spontaneous";
  audioFormat: string;
  totalHours: number;
  splits: {
    train: number;
    validation: number;
    test: number;
  };
  features: {
    audio: string;
    transcript_annotated: string;
    transcript_a: string;
    transcript_b: string;
    transcript_c: string;
  };
  evaluationSuitability: {
    transcriptionWER: { suitable: boolean; details: string };
    disfluencyClassification: { suitable: boolean; details: string };
    timestampEvaluation: { suitable: boolean; details: string };
    clinicalDiagnosis: { suitable: boolean; details: string };
  };
  knownLimitations: string[];
}

export const DISFLUENCY_SPEECH_METADATA: DatasetInfo = {
  name: "DisfluencySpeech",
  repoId: "amaai-lab/DisfluencySpeech",
  license: "Apache-2.0",
  paperTitle: "DisfluencySpeech -- Single-Speaker Conversational Speech Dataset with Paralanguage",
  arxivId: "2406.08820",
  samplingRateHz: 22050,
  speechType: "recreated_studio_actor",
  audioFormat: "wav",
  totalHours: 10,
  splits: {
    train: 4500,
    validation: 250,
    test: 250,
  },
  features: {
    audio: "22,050 Hz .wav audio file (re-enacted single speaker in acoustically-treated studio)",
    transcript_annotated: "Full transcript with non-speech event and disfluency annotations ({F ...}, {D ...}, [ ... + ... ], <...>)",
    transcript_a: "All spoken textual content including disfluencies and restarts with non-speech events stripped",
    transcript_b: "transcript_a with filled pauses and discourse markers removed (coordinating conjunctions kept)",
    transcript_c: "transcript_b with false starts removed (most minimal fluent target)",
  },
  evaluationSuitability: {
    transcriptionWER: {
      suitable: true,
      details: "Provides verbatim disfluent transcript (A) and normalized fluent target (C) for dual-perspective ASR WER evaluation.",
    },
    disfluencyClassification: {
      suitable: true,
      details: "Text-level disfluency tags ({F } filled pauses, {D } discourse markers, restarts [ + ]) allow precision/recall/F1 benchmarking.",
    },
    timestampEvaluation: {
      suitable: false,
      details: "Tabular dataset records lack frame-level or millisecond timestamp boundary intervals. Timestamp alignment is available only in external MFA TextGrids.",
    },
    clinicalDiagnosis: {
      suitable: false,
      details: "Speech was recreated by a single voice actor mimicking Switchboard telephone corpus; not representative of clinical pathology or natural stuttering.",
    },
  },
  knownLimitations: [
    "Single speaker voice actor: cannot evaluate multi-speaker acoustic diversity or speaker diarization.",
    "Recreated speech: actor re-enacted Switchboard utterances, lacking authentic neurological or involuntary stuttering blocks.",
    "Missing tabular timestamps: no word-level or phoneme-level millisecond intervals in standard Hugging Face rows.",
    "Informal conversational 1990s telephone content: occasional non-therapeutic or sensitive topics not suitable for patient-facing practice passages.",
  ],
};

export interface ParsedGroundTruthDisfluencies {
  filledPauses: string[];      // e.g. ["uh", "um"]
  discourseMarkers: string[];  // e.g. ["you know", "well"]
  restarts: Array<{ raw: string; reparandum: string; repair: string }>; // e.g. ["[ I + I ]"]
  nonSpeechEvents: string[];   // e.g. ["laughter", "sigh"]
  totalCount: number;
}

export interface DisfluencySample {
  id: string;
  split: "validation" | "test" | "train";
  transcript_annotated: string;
  transcript_a: string;
  transcript_b: string;
  transcript_c: string;
  audioUrl?: string;
  groundTruth: ParsedGroundTruthDisfluencies;
}

export interface SampleEvaluationResult {
  sampleId: string;
  referenceTextA: string;
  referenceTextC: string;
  hypothesisTranscript: string;
  werVsRawA: number;        // WER against verbatim transcript A (0.0 - 1.0)
  werVsFluentC: number;     // WER against cleaned fluent transcript C (0.0 - 1.0)
  groundTruthDisfluencies: ParsedGroundTruthDisfluencies;
  detectedRepetitions: number;
  detectedPauses: number;
  detectedEventsCount: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  timestampStatus: "UNAVAILABLE_IN_TABULAR_SCHEMA";
  observations: string[];
}

export interface EvaluationReport {
  timestamp: string;
  dataset: string;
  sampleCount: number;
  aggregateMetrics: {
    meanWerRawA: number;
    meanWerFluentC: number;
    overallPrecision: number;
    overallRecall: number;
    overallF1: number;
    totalGroundTruthDisfluencies: number;
    totalDetectedEvents: number;
    totalTruePositives: number;
    totalFalsePositives: number;
    totalFalseNegatives: number;
  };
  sampleResults: SampleEvaluationResult[];
  datasetAssessment: {
    speechNature: string;
    suitableForEvaluation: boolean;
    suitableForPatientPractice: boolean;
    practiceLibraryRecommendation: string;
  };
  safetyNotice: string;
}
