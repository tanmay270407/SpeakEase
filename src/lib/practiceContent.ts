export interface PracticeContentItem {
  id: string;
  title: string;
  paragraph: string;
  category: string;
  targetFocus: string;
}

export const DYNAMIC_PRACTICE_PARAGRAPHS: PracticeContentItem[] = [
  {
    id: "morning-momentum",
    title: "Morning Momentum",
    paragraph: "Every morning offers a quiet moment to begin again. I take a slow, gentle breath and let my words flow at their natural speed. There is no need to hurry through my thoughts. Pausing between ideas helps me stay grounded, relaxed, and clear. With each sentence, I speak with steady ease.",
    category: "Pacing & Gentle Onset",
    targetFocus: "Breath pacing and relaxed phrasing"
  },
  {
    id: "ocean-breeze",
    title: "Ocean Shoreline",
    paragraph: "The ocean waves roll onto the sandy shoreline with a steady, soothing rhythm. Standing near the water, I take in the fresh sea air and feel fully present. I allow my voice to carry each phrase with balance, gentle pauses, and natural confidence throughout the reading.",
    category: "Rhythmic Cadence",
    targetFocus: "Continuous airflow and steady rhythm"
  },
  {
    id: "mountain-trail",
    title: "Mountain Path",
    paragraph: "Walking along a quiet forest trail brings a sense of calm and clarity. Sunlight filters through the tall pine branches as the path winds gently upward. I notice the cadence of my breath and speak with intention, giving every word its own comfortable space.",
    category: "Phrasing & Articulation",
    targetFocus: "Intentional pausing and phrase grouping"
  },
  {
    id: "everyday-reflections",
    title: "Everyday Conversations",
    paragraph: "Every day gives me a new opportunity to practice speaking with confidence. I take a comfortable breath, speak at my own pace, and focus on expressing my thoughts clearly. I can pause when I need to, continue when I am ready, and stay relaxed while speaking with others.",
    category: "Conversational Flow",
    targetFocus: "Comfortable pacing and self-regulation"
  },
  {
    id: "garden-pathways",
    title: "Botanical Garden",
    paragraph: "Exploring the quiet garden pathways reveals colorful blooms and shaded stone benches. A gentle breeze stirs the leaves, creating a peaceful atmosphere. Reading aloud at a steady tempo helps me connect ideas smoothly and maintain a natural conversational rhythm.",
    category: "Smooth Transitions",
    targetFocus: "Smooth phonation transitions and phrase pacing"
  },
  {
    id: "evening-calm",
    title: "Evening Horizon",
    paragraph: "As the sun sets below the horizon, the evening sky fills with shades of amber and violet. Taking time to unwind allows the mind and body to relax. When I speak, I let my voice resonate comfortably, releasing any tension and enjoying the steady flow of words.",
    category: "Relaxed Articulation",
    targetFocus: "Tension release and gentle vocal resonance"
  }
];

export function getRandomPracticeParagraph(excludeId?: string): PracticeContentItem {
  const pool = excludeId 
    ? DYNAMIC_PRACTICE_PARAGRAPHS.filter(p => p.id !== excludeId)
    : DYNAMIC_PRACTICE_PARAGRAPHS;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex] || DYNAMIC_PRACTICE_PARAGRAPHS[0];
}
