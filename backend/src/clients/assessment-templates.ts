/**
 * Built-in assessment templates the nutritionist can assign to a client.
 *
 * The shape mirrors exactly what the client portal renderer expects in
 * `pending_review_cards.generated_content`:
 *   { title, intro, questions: [{ id, question, type, options? }] }
 * where type ∈ 'text' | 'scale' (1–5) | 'choice' (single) | 'multi'.
 *
 * Ported from the legacy Sheizen Wellness Health / Stress (PSS-10) / Sleep
 * assessments.
 */

export type AssessmentType = 'health' | 'stress' | 'sleep';

export type AssessmentCardType = 'health_assessment' | 'stress_card' | 'sleep_card';

export interface TemplateQuestion {
  id: string;
  question: string;
  type: 'text' | 'scale' | 'choice' | 'multi';
  options?: string[];
}

export interface AssessmentTemplate {
  card_type: AssessmentCardType;
  title: string;
  intro: string;
  questions: TemplateQuestion[];
}

const HEALTH: AssessmentTemplate = {
  card_type: 'health_assessment',
  title: 'Health Assessment',
  intro: 'A quick picture of your overall health so we can personalise your plan. Answer as honestly as you can.',
  questions: [
    { id: 'main_concern', question: 'What is your main health concern or goal right now?', type: 'text' },
    { id: 'energy', question: 'How would you rate your daily energy levels? (1 = very low, 5 = excellent)', type: 'scale' },
    { id: 'digestion', question: 'How is your digestion most days?', type: 'choice', options: ['Comfortable', 'Occasional bloating/gas', 'Frequent discomfort', 'Constipation', 'Loose stools'] },
    { id: 'water', question: 'How much water do you drink daily?', type: 'choice', options: ['Less than 1 L', '1–2 L', '2–3 L', 'More than 3 L'] },
    { id: 'exercise', question: 'How often do you exercise in a week?', type: 'choice', options: ['Rarely / never', '1–2 times', '3–4 times', '5+ times'] },
    { id: 'diet_pattern', question: 'Which best describes your usual diet?', type: 'choice', options: ['Vegetarian', 'Non-vegetarian', 'Eggetarian', 'Vegan', 'Mixed'] },
    { id: 'conditions', question: 'Do you have any of these conditions?', type: 'multi', options: ['Diabetes', 'Thyroid', 'PCOS', 'Hypertension', 'High cholesterol', 'None'] },
    { id: 'allergies', question: 'Any food allergies or intolerances?', type: 'text' },
    { id: 'medications', question: 'Current medications or supplements (if any)?', type: 'text' },
    { id: 'sleep_quality', question: 'How well do you sleep on average? (1 = poorly, 5 = very well)', type: 'scale' },
    { id: 'stress_level', question: 'How stressed do you feel most days? (1 = relaxed, 5 = very stressed)', type: 'scale' },
    { id: 'notes', question: 'Anything else you would like your nutritionist to know?', type: 'text' },
  ],
};

// PSS-10 — Perceived Stress Scale. Originally 0–4 (Never→Very often); rendered
// here on the portal's 1–5 scale (1 = Never, 5 = Very often).
const STRESS: AssessmentTemplate = {
  card_type: 'stress_card',
  title: 'Stress Check-in (PSS-10)',
  intro: 'For each question, rate how often you felt this way in the last month. 1 = Never, 2 = Almost never, 3 = Sometimes, 4 = Fairly often, 5 = Very often.',
  questions: [
    { id: 'pss1', question: 'Been upset because of something that happened unexpectedly?', type: 'scale' },
    { id: 'pss2', question: 'Felt unable to control the important things in your life?', type: 'scale' },
    { id: 'pss3', question: 'Felt nervous and stressed?', type: 'scale' },
    { id: 'pss4', question: 'Felt confident about your ability to handle personal problems?', type: 'scale' },
    { id: 'pss5', question: 'Felt that things were going your way?', type: 'scale' },
    { id: 'pss6', question: 'Found that you could not cope with all the things you had to do?', type: 'scale' },
    { id: 'pss7', question: 'Been able to control irritations in your life?', type: 'scale' },
    { id: 'pss8', question: 'Felt that you were on top of things?', type: 'scale' },
    { id: 'pss9', question: 'Been angered because of things outside of your control?', type: 'scale' },
    { id: 'pss10', question: 'Felt difficulties were piling up so high you could not overcome them?', type: 'scale' },
  ],
};

const SLEEP: AssessmentTemplate = {
  card_type: 'sleep_card',
  title: 'Sleep Diary',
  intro: 'Help us understand your sleep so we can improve your recovery and energy.',
  questions: [
    { id: 'bedtime', question: 'What time do you usually go to bed?', type: 'choice', options: ['Before 10 PM', '10–11 PM', '11 PM–12 AM', '12–1 AM', 'After 1 AM'] },
    { id: 'wake_time', question: 'What time do you usually wake up?', type: 'choice', options: ['Before 5 AM', '5–6 AM', '6–7 AM', '7–8 AM', 'After 8 AM'] },
    { id: 'hours', question: 'How many hours do you sleep on average?', type: 'choice', options: ['Less than 5', '5–6', '6–7', '7–8', 'More than 8'] },
    { id: 'fall_asleep', question: 'How long does it take you to fall asleep?', type: 'choice', options: ['Under 15 min', '15–30 min', '30–60 min', 'Over an hour'] },
    { id: 'wakings', question: 'How often do you wake up during the night?', type: 'choice', options: ['Never', 'Once', '2–3 times', 'More than 3 times'] },
    { id: 'quality', question: 'How would you rate your overall sleep quality? (1 = poor, 5 = excellent)', type: 'scale' },
    { id: 'refreshed', question: 'How refreshed do you feel on waking? (1 = exhausted, 5 = fully refreshed)', type: 'scale' },
    { id: 'daytime_sleepiness', question: 'How sleepy do you feel during the day? (1 = alert, 5 = very sleepy)', type: 'scale' },
    { id: 'screens', question: 'Do you use screens within an hour of bedtime?', type: 'choice', options: ['Never', 'Sometimes', 'Most nights', 'Every night'] },
    { id: 'caffeine_late', question: 'Do you have caffeine after 4 PM?', type: 'choice', options: ['Never', 'Occasionally', 'Daily'] },
    { id: 'sleep_notes', question: 'Anything affecting your sleep we should know about?', type: 'text' },
  ],
};

export const ASSESSMENT_TEMPLATES: Record<AssessmentType, AssessmentTemplate> = {
  health: HEALTH,
  stress: STRESS,
  sleep: SLEEP,
};

/** Build the generated_content JSON stored on the card for a given type. */
export function buildAssessmentContent(type: AssessmentType): {
  card_type: AssessmentCardType;
  content: { title: string; intro: string; questions: TemplateQuestion[] };
} {
  const t = ASSESSMENT_TEMPLATES[type];
  return {
    card_type: t.card_type,
    content: { title: t.title, intro: t.intro, questions: t.questions },
  };
}
