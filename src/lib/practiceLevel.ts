export type PracticeLevelType = 'Needs Practice' | 'Developing' | 'Good Progress' | 'Strong Progress' | 'Not enough data yet';

export interface PracticeLevelResult {
  level: PracticeLevelType;
  score: number; // 0 to 4 (0 = Not enough data)
  description: string;
}

export const PRACTICE_LEVEL_STEPS: PracticeLevelType[] = [
  'Needs Practice',
  'Developing',
  'Good Progress',
  'Strong Progress'
];

/**
 * Calculates a non-diagnostic Practice Level from actual acoustic/speech metrics.
 * Not a medical diagnosis or clinical severity score.
 */
export function calculatePracticeLevel(metrics?: {
  repetitions?: number | null;
  pauses?: number | null;
  prolongations?: number | null;
  speech_rate?: number | string | null;
  duration?: number | null;
  wordCount?: number | null;
} | null): PracticeLevelResult {
  if (!metrics) {
    return {
      level: 'Not enough data yet',
      score: 0,
      description: 'Record a longer practice passage (3+ seconds) to generate a practice performance level.'
    };
  }

  const duration = Number(metrics.duration) || 0;
  const wordCount = Number(metrics.wordCount) || 0;
  
  // Insufficient audio or word evidence check
  if (duration > 0 && duration < 3) {
    return {
      level: 'Not enough data yet',
      score: 0,
      description: 'The recording was too short to reliably evaluate speech flow metrics.'
    };
  }

  const rep = Number(metrics.repetitions) || 0;
  const pause = Number(metrics.pauses) || 0;
  const prol = Number(metrics.prolongations) || 0;
  const rate = Number(metrics.speech_rate) || 0;

  // Base score is 4 (Strong Progress)
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
      return {
        level: 'Strong Progress',
        score: 4,
        description: 'Steady pacing and smooth speech flow observed during this practice session.'
      };
    case 3:
      return {
        level: 'Good Progress',
        score: 3,
        description: 'Good speech control with minor hesitations observed.'
      };
    case 2:
      return {
        level: 'Developing',
        score: 2,
        description: 'Consistent practice will help build pacing and reduce pauses.'
      };
    case 1:
    default:
      return {
        level: 'Needs Practice',
        score: 1,
        description: 'Focus on relaxed breathing and taking your time between sentences.'
      };
  }
}

