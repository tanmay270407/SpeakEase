export interface PracticeSection {
  heading?: string;
  subheading?: string;
  items: string[];
  notes?: string;
}

export interface ExerciseDetail {
  id: string;
  slug: string;
  title: string;
  clinicalPurpose: string;
  estimatedDuration: string;
  estimatedDurationSeconds: number;
  instructions: string[];
  practiceSections: PracticeSection[];
  tipsBeforeRecording: string[];
  plainPracticeText: string;
}

export const EXERCISE_DETAILS_CATALOG: Record<string, ExerciseDetail> = {
  // 1. Diadochokinetic (DDK) Rate Test
  "33333333-4444-5555-6666-777777777771": {
    id: "33333333-4444-5555-6666-777777777771",
    slug: "ddk-rate-test",
    title: "Diadochokinetic (DDK) Rate Test",
    clinicalPurpose: "Improve rapid tongue and lip coordination.",
    estimatedDuration: "60 seconds",
    estimatedDurationSeconds: 60,
    instructions: [
      "Sit upright in a comfortable position and take a calm, diaphragmatic breath.",
      "Pronounce each syllable group crisply, striving for steady rhythm and clarity rather than rushing.",
      "Begin with the individual syllable sets: articulate 'Pa Pa Pa', then 'Ta Ta Ta', then 'Ka Ka Ka'.",
      "Conclude by combining all three into 'Pa-Ta-Ka', repeating the sequence smoothly and continuously on a single exhalation.",
      "Press 'Start Recording' when you are ready to begin."
    ],
    practiceSections: [
      {
        heading: "Part 1: Lip Articulation (Bilabial)",
        subheading: "Focus on clean lip closure and release",
        items: ["Pa Pa Pa"]
      },
      {
        heading: "Part 2: Tongue-Tip Articulation (Alveolar)",
        subheading: "Focus on crisp tongue-tip contact behind upper front teeth",
        items: ["Ta Ta Ta"]
      },
      {
        heading: "Part 3: Back-of-Tongue Articulation (Velar)",
        subheading: "Focus on quick posterior tongue elevation against the soft palate",
        items: ["Ka Ka Ka"]
      },
      {
        heading: "Part 4: Rapid Motor Sequencing",
        subheading: "Combine syllables and repeat smoothly without stopping",
        items: ["Pa-Ta-Ka repeated continuously."]
      }
    ],
    plainPracticeText: "Pa Pa Pa\nTa Ta Ta\nKa Ka Ka\nPa-Ta-Ka repeated continuously.",
    tipsBeforeRecording: [
      "Prioritize consistent syllable clarity and timing over pure speed.",
      "Keep your microphone about 6 to 8 inches from your mouth at chin level.",
      "Take a comfortable breath before starting the continuous Pa-Ta-Ka repetition.",
      "Practice in a quiet room to ensure the clearest acoustic feedback."
    ]
  },

  // 2. Prolonged Vowel Phonation
  "33333333-4444-5555-6666-777777777772": {
    id: "33333333-4444-5555-6666-777777777772",
    slug: "prolonged-vowel-phonation",
    title: "Prolonged Vowel Phonation",
    clinicalPurpose: "Sustain steady airflow and vocal fold vibration for laryngeal control and respiratory coordination.",
    estimatedDuration: "45 seconds",
    estimatedDurationSeconds: 45,
    instructions: [
      "Sit tall with relaxed shoulders and take a slow, gentle breath through your nose.",
      "Produce each vowel sound at a comfortable, natural speaking pitch and volume.",
      "Sustain each vowel steadily for 5 to 8 seconds without straining or forcing your breath.",
      "Pause briefly, take a restorative breath, and proceed to the next vowel sound.",
      "Press 'Start Recording' to begin your phonation session."
    ],
    practiceSections: [
      {
        heading: "Sustained Vowel Series",
        subheading: "Hold each vowel steadily with smooth, relaxed airflow",
        items: [
          "AAAAA",
          "EEEEE",
          "IIIII",
          "OOOOO",
          "UUUUU"
        ]
      }
    ],
    plainPracticeText: "AAAAA\nEEEEE\nIIIII\nOOOOO\nUUUUU",
    tipsBeforeRecording: [
      "Maintain a steady, unwavering pitch throughout each vowel duration.",
      "Avoid pressing or clamping your throat muscles; focus on effortless resonant voicing.",
      "Stop immediately if you experience vocal tightness, tickling, or fatigue.",
      "Position your device on a stable surface to eliminate handling rustle."
    ]
  },

  // 3. Easy Onset & Gentle Voicing
  "33333333-4444-5555-6666-777777777773": {
    id: "33333333-4444-5555-6666-777777777773",
    slug: "easy-onset-gentle-voicing",
    title: "Easy Onset & Gentle Voicing",
    clinicalPurpose: "Reduce vocal tension and prevent hard glottal attacks by initiating phonation with soft exhalation.",
    estimatedDuration: "90 seconds",
    estimatedDurationSeconds: 90,
    instructions: [
      "Take a relaxed breath and release a tiny hint of air (like a soft sigh) just before each initial sound.",
      "Gently ease into voicing each single word, maintaining smooth and continuous breath support.",
      "Once you feel the soft onset in single words, transition to the full conversational sentences.",
      "Keep your cadence measured, unhurried, and natural throughout all practice items.",
      "Press 'Start Recording' when you are comfortable with the phrases."
    ],
    practiceSections: [
      {
        heading: "Single Words (Gentle Vowel Onsets)",
        subheading: "Ease into the initial vowel with a soft, relaxed breath",
        items: [
          "Apple",
          "Orange",
          "Ice"
        ]
      },
      {
        heading: "Conversational Sentences",
        subheading: "Carry smooth, gentle vocal flow across each complete thought",
        items: [
          "I am ready.",
          "Open the door.",
          "It is a sunny day.",
          "Every morning I practice speaking slowly and clearly."
        ]
      }
    ],
    plainPracticeText: "Apple\nOrange\nIce\n\nI am ready.\nOpen the door.\nIt is a sunny day.\nEvery morning I practice speaking slowly and clearly.",
    tipsBeforeRecording: [
      "Imagine blending a soft /h/ exhale into the very beginning of each vowel.",
      "Do not push or shout; quiet, confident phonation produces the best clinical outcomes.",
      "Pause naturally at commas and punctuation for a relaxed inhalation.",
      "Read each line aloud once or twice at your own pace before clicking record."
    ]
  }
};

export function getExerciseDetailsById(idOrSlug?: string | null): ExerciseDetail {
  if (!idOrSlug) {
    // Default fallback to DDK
    return EXERCISE_DETAILS_CATALOG["33333333-4444-5555-6666-777777777771"];
  }

  // Direct match by ID
  if (EXERCISE_DETAILS_CATALOG[idOrSlug]) {
    return EXERCISE_DETAILS_CATALOG[idOrSlug];
  }

  // Match by slug
  const bySlug = Object.values(EXERCISE_DETAILS_CATALOG).find(e => e.slug === idOrSlug);
  if (bySlug) return bySlug;

  // Match by partial name or keyword
  const lower = idOrSlug.toLowerCase();
  if (lower.includes("ddk") || lower.includes("diadochokinetic") || lower.includes("tongue")) {
    return EXERCISE_DETAILS_CATALOG["33333333-4444-5555-6666-777777777771"];
  }
  if (lower.includes("vowel") || lower.includes("phonation") || lower.includes("prolonged")) {
    return EXERCISE_DETAILS_CATALOG["33333333-4444-5555-6666-777777777772"];
  }
  if (lower.includes("onset") || lower.includes("voicing") || lower.includes("gentle")) {
    return EXERCISE_DETAILS_CATALOG["33333333-4444-5555-6666-777777777773"];
  }

  // Default fallback
  return EXERCISE_DETAILS_CATALOG["33333333-4444-5555-6666-777777777771"];
}
