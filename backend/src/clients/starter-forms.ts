/**
 * Starter form library — ready-made assessment forms a workspace can install
 * into its own `assessment_form_templates` with one click.
 *
 * These differ from the built-ins in assessment-templates.ts: a built-in is
 * hardcoded and assigned by `type`, and can never be edited. A starter is
 * COPIED into the workspace as an ordinary row, so the owner can reword, trim,
 * or extend it freely afterwards — and their edits survive future deploys
 * because nothing here overwrites an installed copy.
 */

import type { TemplateQuestion } from './assessment-templates';

export interface StarterForm {
  /** Stable key used by the install endpoint. */
  key: string;
  name: string;
  description: string;
  questions: TemplateQuestion[];
}

/**
 * General Nutritional Assessment — the practice's standard clinical intake,
 * transcribed from the 4-page paper form.
 *
 * Two deliberate deviations from the paper original:
 *   - Section 9 (Dietitian's Clinical Impression & Plan + signatures) is
 *     omitted. It is filled by the clinician, not the client, and this form is
 *     client-facing; the reviewer's note on the submitted assessment covers it.
 *   - "Do you consume alcohol?" appears in both Lifestyle and Dietary on paper.
 *     Kept once, under Dietary, where it asks for frequency too.
 */
const GENERAL_NUTRITIONAL_ASSESSMENT: StarterForm = {
  key: 'general_nutritional_assessment',
  name: 'General Nutritional Assessment',
  description:
    'The standard clinical intake — personal details, anthropometry, labs, medical history, diet, stress, sleep and lifestyle. Please answer whatever you can; leave anything you are unsure of blank.',
  questions: [
    // ── 1. Personal information ──────────────────────────────────────
    { id: 'sec_personal', question: 'Personal Information', type: 'section' },
    { id: 'full_name', question: 'Full name', type: 'text', w: 6, required: true },
    { id: 'age', question: 'Age', type: 'number', w: 3 },
    { id: 'sex', question: 'Sex', type: 'choice', options: ['Female', 'Male', 'Other / prefer not to say'], w: 3 },
    { id: 'dob', question: 'Date of birth', type: 'text', w: 4 },
    { id: 'contact_number', question: 'Contact number', type: 'text', w: 4 },
    { id: 'email', question: 'Email address', type: 'text', w: 4 },
    { id: 'occupation', question: 'Occupation', type: 'text', w: 6 },
    { id: 'marital_status', question: 'Marital status', type: 'choice', options: ['Single', 'Married', 'Other / prefer not to say'], w: 6 },
    { id: 'address', question: 'Address', type: 'text', w: 12 },
    { id: 'referred_by', question: 'Referred by', type: 'text', w: 4 },
    { id: 'assessment_date', question: 'Date of assessment', type: 'text', w: 4 },
    { id: 'assessed_by', question: 'Assessed by (dietitian)', type: 'text', w: 4 },

    // ── 2. Anthropometric ────────────────────────────────────────────
    { id: 'sec_anthro', question: 'Anthropometric Assessment', type: 'section' },
    { id: 'height_cm', question: 'What is your height (cm)?', type: 'number', w: 4 },
    { id: 'weight_kg', question: 'What is your current weight (kg)?', type: 'number', w: 4 },
    { id: 'usual_weight_kg', question: 'What was your usual weight before any recent change (kg)?', type: 'number', w: 4 },
    { id: 'weight_change', question: 'Has your weight changed recently? By how much, and over what period?', type: 'text', w: 12 },
    { id: 'bmi', question: 'What is your BMI (kg/m²)?', type: 'number', w: 4 },
    { id: 'waist_cm', question: 'What is your waist circumference (cm)?', type: 'number', w: 4 },
    { id: 'hip_cm', question: 'What is your hip circumference (cm)?', type: 'number', w: 4 },
    { id: 'waist_hip_ratio', question: 'What is your waist–hip ratio?', type: 'text', w: 4 },
    { id: 'body_fat_pct', question: 'What is your body fat % (if known)?', type: 'text', w: 4 },
    { id: 'muscle_mass', question: 'What is your muscle mass (if known)?', type: 'text', w: 4 },

    // ── 3. Biochemical / laboratory ──────────────────────────────────
    { id: 'sec_biochem', question: 'Biochemical / Laboratory Assessment', type: 'section' },
    { id: 'recent_bloods', question: 'Have you had any recent blood tests? Please share the results with your nutritionist if you have them.', type: 'yesno', w: 12 },
    {
      id: 'lab_markers',
      question: 'Common markers — fill in whichever apply.',
      type: 'table',
      w: 12,
      rows: [
        'Fasting Blood Glucose',
        'HbA1c',
        'Total Cholesterol / LDL / HDL / Triglycerides',
        'Thyroid Profile (TSH/T3/T4)',
        'Vitamin D',
        'Vitamin B12',
        'Hemoglobin',
        'Liver Function Test',
        'Kidney Function Test',
        'Other',
      ],
      columns: ['Result', 'Date', 'Reference Range'],
    },

    // ── 4. Clinical ──────────────────────────────────────────────────
    { id: 'sec_clinical', question: 'Clinical Assessment', type: 'section' },
    { id: 'main_concern', question: 'What is your main health or nutrition concern today?', type: 'text', w: 12, required: true },
    {
      id: 'conditions',
      question: 'Do you have any diagnosed medical conditions?',
      type: 'multi',
      options: [
        'Diabetes', 'Thyroid disorder', 'Hypertension', 'Cholesterol/lipid disorder',
        'PCOS/PCOD', 'Digestive disorder (IBS/GERD/etc.)', 'Autoimmune condition',
        'Kidney disease', 'Other', 'None',
      ],
      w: 12,
    },
    { id: 'medications', question: 'Are you currently on any medications or supplements?', type: 'text', w: 12 },
    { id: 'allergies', question: 'Do you have any known food allergies or intolerances?', type: 'text', w: 12 },
    { id: 'surgeries', question: 'Any past surgeries or hospitalizations?', type: 'text', w: 12 },
    { id: 'family_history', question: 'Any family history of diabetes, heart disease, thyroid, or obesity?', type: 'text', w: 12 },
    { id: 'menstrual', question: 'For women: any menstrual, hormonal, or reproductive concerns you’d like to mention?', type: 'text', w: 12 },

    // ── 5. Dietary ───────────────────────────────────────────────────
    { id: 'sec_dietary', question: 'Dietary Assessment — a typical day of eating', type: 'section' },
    { id: 'meal_early_morning', question: 'Early morning — what do you have?', type: 'text', w: 6 },
    { id: 'meal_breakfast', question: 'Breakfast — what do you have?', type: 'text', w: 6 },
    { id: 'meal_mid_morning', question: 'Mid-morning — what do you have?', type: 'text', w: 6 },
    { id: 'meal_lunch', question: 'Lunch — what do you have?', type: 'text', w: 6 },
    { id: 'meal_evening_snack', question: 'Evening snack — what do you have?', type: 'text', w: 6 },
    { id: 'meal_dinner', question: 'Dinner — what do you have?', type: 'text', w: 6 },
    { id: 'meal_post_dinner', question: 'Post-dinner — do you eat or drink anything?', type: 'text', w: 6 },
    { id: 'diet_type', question: 'What type of diet do you follow?', type: 'choice', options: ['Vegetarian', 'Non-vegetarian', 'Eggetarian', 'Vegan', 'Mixed'], w: 6 },
    { id: 'meals_per_day', question: 'How many meals do you typically eat per day?', type: 'number', w: 6 },
    { id: 'water_intake', question: 'How much water do you drink daily?', type: 'choice', options: ['Less than 1 L', '1–2 L', '2–3 L', 'More than 3 L'], w: 6 },
    { id: 'appetite', question: 'How would you describe your appetite?', type: 'choice', options: ['Poor', 'Normal', 'Strong', 'Varies day to day'], w: 6 },
    { id: 'bowel_habits', question: 'How are your bowel habits?', type: 'text', w: 6 },
    { id: 'eating_out', question: 'How often do you eat outside or order food?', type: 'text', w: 6 },
    { id: 'emotional_eating', question: 'Do you eat in response to stress or emotions?', type: 'yesno', w: 6 },
    { id: 'food_preferences', question: 'Do you have strong food preferences?', type: 'text', w: 6 },
    { id: 'food_aversions', question: 'Do you have any food aversions?', type: 'text', w: 6 },
    { id: 'cravings', question: 'Do you get cravings (sweet/salty/fried)? How often?', type: 'text', w: 6 },
    { id: 'caffeine', question: 'Do you consume caffeine? How much?', type: 'text', w: 6 },
    { id: 'alcohol', question: 'Do you consume alcohol? How often?', type: 'text', w: 6 },
    { id: 'past_diets', question: 'Have you tried any diets before? What happened?', type: 'text', w: 12 },

    // ── 6. Stress ────────────────────────────────────────────────────
    { id: 'sec_stress', question: 'Stress Assessment', type: 'section' },
    { id: 'stress_level', question: 'On a scale of 1–10, how would you rate your everyday stress level?', type: 'scale', max: 10, w: 12 },
    { id: 'stress_sources', question: 'What are your main sources of stress?', type: 'text', w: 12 },
    { id: 'stress_symptoms', question: 'Do you notice any physical symptoms when stressed?', type: 'text', w: 12 },
    { id: 'stress_coping', question: 'How do you usually cope with stress?', type: 'text', w: 12 },
    { id: 'stress_affects_eating', question: 'Does stress affect your eating habits?', type: 'yesno', w: 6 },
    { id: 'support_network', question: 'Do you feel you have adequate support (family/friends)?', type: 'yesno', w: 6 },

    // ── 7. Sleep ─────────────────────────────────────────────────────
    { id: 'sec_sleep', question: 'Sleep Assessment', type: 'section' },
    { id: 'sleep_schedule', question: 'What time do you usually go to bed and wake up?', type: 'text', w: 6 },
    { id: 'sleep_hours', question: 'How many hours do you sleep on average?', type: 'number', w: 6 },
    { id: 'sleep_latency', question: 'How long does it take you to fall asleep?', type: 'text', w: 6 },
    { id: 'sleep_quality', question: 'How would you rate your sleep quality? (1 = poor, 5 = excellent)', type: 'scale', max: 5, w: 6 },
    { id: 'night_waking', question: 'Do you wake up during the night? How often?', type: 'text', w: 6 },
    { id: 'screens_before_bed', question: 'Do you use screens before bed?', type: 'yesno', w: 6 },
    { id: 'wake_rested', question: 'Do you feel rested when you wake up?', type: 'yesno', w: 6 },
    { id: 'snoring_apnea', question: 'Do you snore or have any signs of sleep apnea?', type: 'yesno', w: 6 },

    // ── 8. Lifestyle ─────────────────────────────────────────────────
    { id: 'sec_lifestyle', question: 'Lifestyle Assessment', type: 'section' },
    { id: 'physical_activity', question: 'What kind of physical activity do you do, if any?', type: 'text', w: 12 },
    { id: 'exercise_frequency', question: 'How often and for how long do you exercise per week?', type: 'text', w: 6 },
    { id: 'routine_activity', question: 'Is your daily routine mostly sedentary or active?', type: 'choice', options: ['Mostly sedentary', 'Lightly active', 'Moderately active', 'Very active'], w: 6 },
    { id: 'screen_time', question: 'How much screen time do you have per day?', type: 'text', w: 6 },
    { id: 'smoking', question: 'Do you smoke?', type: 'yesno', w: 6 },
    { id: 'sunlight', question: 'How much time do you spend outdoors or in sunlight daily?', type: 'text', w: 6 },
    { id: 'shift_work', question: 'Do you work in shifts or have an irregular schedule?', type: 'yesno', w: 6 },
    { id: 'travel', question: 'How often do you travel for work or personal reasons?', type: 'text', w: 6 },
    { id: 'environment_supports', question: 'Would you say your home/work environment supports healthy habits?', type: 'yesno', w: 6 },
  ],
};

export const STARTER_FORMS: StarterForm[] = [GENERAL_NUTRITIONAL_ASSESSMENT];

export function starterFormByKey(key: string): StarterForm | undefined {
  return STARTER_FORMS.find((f) => f.key === key);
}
