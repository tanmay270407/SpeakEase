export type PracticeLevelType = 'Needs Practice' | 'Developing' | 'Good Progress' | 'Strong Progress';

export interface PracticeLevelResult {
  level: PracticeLevelType;
  score: number; // 1 to 4
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
} | null): PracticeLevelResult | null {
  if (!metrics || (metrics.repetitions === undefined && metrics.pauses === undefined && metrics.prolongations === undefined && metrics.speech_rate === undefined)) {
    return null;
  }

  const rep = Number(metrics.repetitions) || 0;
  const pause = Number(metrics.pauses) || 0;
  const prol = Number(metrics.prolongations) || 0;
  const rate = Number(metrics.speech_rate) || 0;

  // Derive score from objective acoustic markers:
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
