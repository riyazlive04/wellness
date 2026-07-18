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
    'The standard clinical intake - personal details, anthropometry, labs, medical history, diet, stress, sleep and lifestyle. Please answer whatever you can; leave anything you are unsure of blank.',
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
    { id: 'waist_hip_ratio', question: 'What is your waist-hip ratio?', type: 'text', w: 4 },
    { id: 'body_fat_pct', question: 'What is your body fat % (if known)?', type: 'text', w: 4 },
    { id: 'muscle_mass', question: 'What is your muscle mass (if known)?', type: 'text', w: 4 },

    // ── 3. Biochemical / laboratory ──────────────────────────────────
    { id: 'sec_biochem', question: 'Biochemical / Laboratory Assessment', type: 'section' },
    { id: 'recent_bloods', question: 'Have you had any recent blood tests? Please share the results with your nutritionist if you have them.', type: 'yesno', w: 12 },
    {
      id: 'lab_markers',
      question: 'Common markers - fill in whichever apply.',
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
    { id: 'sec_dietary', question: 'Dietary Assessment - a typical day of eating', type: 'section' },
    { id: 'meal_early_morning', question: 'Early morning - what do you have?', type: 'text', w: 6 },
    { id: 'meal_breakfast', question: 'Breakfast - what do you have?', type: 'text', w: 6 },
    { id: 'meal_mid_morning', question: 'Mid-morning - what do you have?', type: 'text', w: 6 },
    { id: 'meal_lunch', question: 'Lunch - what do you have?', type: 'text', w: 6 },
    { id: 'meal_evening_snack', question: 'Evening snack - what do you have?', type: 'text', w: 6 },
    { id: 'meal_dinner', question: 'Dinner - what do you have?', type: 'text', w: 6 },
    { id: 'meal_post_dinner', question: 'Post-dinner - do you eat or drink anything?', type: 'text', w: 6 },
    { id: 'diet_type', question: 'What type of diet do you follow?', type: 'choice', options: ['Vegetarian', 'Non-vegetarian', 'Eggetarian', 'Vegan', 'Mixed'], w: 6 },
    { id: 'meals_per_day', question: 'How many meals do you typically eat per day?', type: 'number', w: 6 },
    { id: 'water_intake', question: 'How much water do you drink daily?', type: 'choice', options: ['Less than 1 L', '1-2 L', '2-3 L', 'More than 3 L'], w: 6 },
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
    { id: 'stress_level', question: 'On a scale of 1-10, how would you rate your everyday stress level?', type: 'scale', max: 10, w: 12 },
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

/**
 * Quick Intake — the three-minute version of the General Nutritional
 * Assessment, for clients who would otherwise abandon an 82-question form.
 *
 * The brevity is the feature, not a compromise. This form exists to get someone
 * STARTED, so the bar for inclusion is: "would the nutritionist be unable to
 * open the first consult without this?" Anything answerable in conversation —
 * sleep, stress, bowel habits, family history, past diets — is deliberately
 * left to the consult or to the full assessment later. Only name and primary
 * goal are required; a half-filled form that arrives beats a complete one that
 * never does.
 */
const QUICK_INTAKE: StarterForm = {
  key: 'quick_intake',
  name: 'Quick Intake',
  description:
    'A short form to get us started - about three minutes. Just the essentials; your nutritionist will go deeper with you in your first consult.',
  questions: [
    // ── About you ────────────────────────────────────────────────────
    { id: 'sec_basics', question: 'About You', type: 'section' },
    { id: 'full_name', question: 'What is your full name?', type: 'text', w: 6, required: true },
    { id: 'age', question: 'Age', type: 'number', w: 3 },
    { id: 'sex', question: 'Sex', type: 'choice', options: ['Female', 'Male', 'Other / prefer not to say'], w: 3 },
    { id: 'contact_number', question: 'Contact number', type: 'text', w: 6 },
    { id: 'email', question: 'Email address', type: 'text', w: 6 },

    // ── What brings you here ─────────────────────────────────────────
    { id: 'sec_goal', question: 'What Brings You Here', type: 'section' },
    {
      id: 'primary_goal',
      question: 'What is your main goal right now?',
      type: 'choice',
      options: [
        'Weight loss', 'Weight gain', 'Manage a health condition', 'Better energy',
        'Digestive health', 'Fitness / muscle gain', 'General wellbeing', 'Other',
      ],
      w: 6,
      required: true,
    },
    { id: 'top_concerns', question: 'What are your top one or two health concerns today?', type: 'text', w: 6 },

    // ── Where you are now ────────────────────────────────────────────
    { id: 'sec_current', question: 'Where You Are Now', type: 'section' },
    { id: 'height_cm', question: 'What is your height (cm)?', type: 'number', w: 4 },
    { id: 'weight_kg', question: 'What is your current weight (kg)?', type: 'number', w: 4 },
    {
      id: 'activity_level',
      question: 'How active is your usual day?',
      type: 'choice',
      options: ['Mostly sedentary', 'Lightly active', 'Moderately active', 'Very active'],
      w: 4,
    },

    // ── Health and food ──────────────────────────────────────────────
    { id: 'sec_health', question: 'Health & Food', type: 'section' },
    {
      id: 'conditions',
      question: 'Do you have any diagnosed medical conditions?',
      type: 'multi',
      options: [
        'Diabetes', 'Thyroid disorder', 'Hypertension', 'Cholesterol/lipid disorder',
        'PCOS/PCOD', 'Digestive disorder (IBS/GERD/etc.)', 'Other', 'None',
      ],
      w: 12,
    },
    { id: 'medications', question: 'Are you taking any medications or supplements?', type: 'text', w: 6 },
    { id: 'allergies', question: 'Do you have any food allergies?', type: 'text', w: 6 },
    {
      id: 'diet_type',
      question: 'What type of diet do you follow?',
      type: 'choice',
      options: ['Vegetarian', 'Non-vegetarian', 'Eggetarian', 'Vegan', 'Mixed'],
      w: 6,
    },
    { id: 'biggest_obstacle', question: 'What is the biggest thing getting in the way of eating the way you’d like to?', type: 'text', w: 12 },
  ],
};

/**
 * 24-Hour Diet Recall — everything eaten and drunk in the last 24 hours.
 *
 * Structured on the USDA AMPM (Automated Multiple-Pass Method), which is what
 * separates an accurate recall from a wishful one. The method's premise is that
 * people genuinely forget, so the same 24 hours is walked more than once from
 * different angles: an unprompted quick list first (so our categories don't
 * anchor the client's own memory), then a probe through the categories people
 * systematically omit, then occasion-by-occasion detail, then a final sweep.
 *
 * India-specific additions a generic recall misses: an explicit chai/coffee
 * count with sugar per cup (four to six sweetened cups a day is common, and
 * vanishes on a form that only asks "do you drink tea?"), cooking method and
 * cooking fat, and a check on whether the day was typical — a recall of a
 * festival or fasting day misleads more than no recall at all.
 *
 * The occasion pass is one `table` (rows = the practice's seven eating
 * occasions), not seven text fields — same reasoning as the 3-Day Food Diary,
 * and deliberately the same shape, so a client who fills both meets one
 * familiar grid rather than two different ways of asking the same thing.
 *
 * Tone is non-judgemental by design rather than by politeness: under-reporting
 * is driven by perceived judgement.
 */
const DIET_RECALL_24H: StarterForm = {
  key: 'diet_recall_24h',
  name: '24-Hour Diet Recall',
  description:
    'Tell us everything you ate and drank in the last 24 hours. There are no right or wrong answers here - we are only trying to see a real day, exactly as it happened. Nothing is too small to mention.',
  questions: [
    // ── 1. First pass: quick list ────────────────────────────────────
    { id: 'sec_quicklist', question: 'First - a quick list', type: 'section' },
    { id: 'recall_date', question: 'Which day are you recalling? (usually yesterday)', type: 'text', w: 6 },
    { id: 'wake_time', question: 'What time did you wake up that day?', type: 'text', w: 6 },
    {
      id: 'quick_list',
      question:
        'Just list everything you can remember eating and drinking, in any order. Don’t worry about times, amounts or spelling - we’ll go through the details together in a moment.',
      type: 'text',
      w: 12,
      required: true,
    },

    // ── 2. Second pass: forgotten foods ──────────────────────────────
    { id: 'sec_forgotten', question: 'Second - the easy-to-forget things', type: 'section' },
    {
      id: 'forgotten_categories',
      question:
        'These are the things almost everyone forgets on the first pass. Tick anything you had - then tell us about it below.',
      type: 'multi',
      options: [
        'Water, juice, buttermilk, soft drinks or any other drink',
        'Chai or coffee',
        'Sweets, chocolate or dessert',
        'Snacks between meals (biscuits, namkeen, chips, nuts, fruit)',
        'Anything added to food (ghee, butter, sugar, pickle, chutney, papad)',
        'Anything tasted while cooking or eaten off someone else’s plate',
        'Supplements, protein powder, health drinks or medicines taken with food',
        'Alcohol',
        'None of these',
      ],
      w: 12,
    },
    { id: 'forgotten_details', question: 'For anything you ticked above - what was it, and roughly when?', type: 'text', w: 12 },
    { id: 'chai_coffee_count', question: 'How many cups of chai or coffee did you have that day?', type: 'number', w: 4 },
    {
      id: 'chai_coffee_sugar',
      question: 'How much sugar in each cup?',
      type: 'choice',
      options: ['No sugar', '½ spoon', '1 spoon', '2 spoons', '3 or more spoons', 'Varies / already sweetened'],
      w: 4,
    },
    {
      id: 'chai_coffee_style',
      question: 'How is it usually made?',
      type: 'choice',
      options: ['With full-fat milk', 'With toned/skim milk', 'Black / no milk', 'Filter coffee with milk', 'Varies'],
      w: 4,
    },

    // ── 3. Third pass: the day, occasion by occasion ─────────────────
    { id: 'sec_occasions', question: 'Third - walk us through the day', type: 'section' },
    {
      id: 'occasions',
      question:
        'Now the same day occasion by occasion. Leave a row blank if you skipped it - a skipped meal is useful information too. For quantity, household measures are perfect: 2 chapatis, 1 katori dal, half a cup of rice, 1 glass of milk.',
      type: 'table',
      w: 12,
      rows: ['Early morning', 'Breakfast', 'Mid-morning', 'Lunch', 'Evening snack', 'Dinner', 'Post-dinner'],
      columns: ['Time', 'What you ate/drank', 'Approx. quantity'],
    },

    // ── 4. How the food was made ─────────────────────────────────────
    { id: 'sec_preparation', question: 'How the food was made', type: 'section' },
    {
      id: 'cooking_methods',
      question: 'How was most of that day’s food cooked?',
      type: 'multi',
      options: [
        'Boiled / steamed', 'Sautéed or tempered (tadka)', 'Shallow-fried', 'Deep-fried',
        'Roasted / grilled / tandoor', 'Raw or uncooked', 'Ready-made / packaged',
      ],
      w: 12,
    },
    {
      id: 'cooking_fat',
      question: 'Which fat was used for cooking?',
      type: 'multi',
      options: ['Ghee', 'Refined oil', 'Groundnut / mustard / sesame oil', 'Coconut oil', 'Olive oil', 'Butter', 'Vanaspati', 'Not sure'],
      w: 6,
    },
    {
      id: 'cooking_fat_amount',
      question: 'Roughly how much oil or ghee went into your food that day, across all meals?',
      type: 'choice',
      options: ['Barely any', 'About 1-2 spoons', 'About 3-4 spoons', 'More than 4 spoons', 'Not sure'],
      w: 6,
    },
    {
      id: 'home_vs_outside',
      question: 'How much of that day’s food was cooked at home?',
      type: 'choice',
      options: ['All home-cooked', 'Mostly home-cooked', 'About half and half', 'Mostly outside or ordered in', 'All outside or ordered in'],
      w: 12,
    },

    // ── 5. Was this a normal day? ────────────────────────────────────
    { id: 'sec_typicality', question: 'Was this a normal day?', type: 'section' },
    {
      id: 'was_typical',
      question: 'Was this a fairly typical day of eating for you?',
      type: 'choice',
      options: ['Yes, quite typical', 'Somewhat typical', 'No, it was unusual'],
      w: 6,
      required: true,
    },
    {
      id: 'day_type',
      question: 'Was there anything special about the day?',
      type: 'multi',
      options: [
        'Ordinary weekday', 'Weekend', 'Festival or celebration', 'Fasting or vrat day',
        'Ate out / party / function', 'Travelling', 'Unwell', 'Working a late or odd shift',
      ],
      w: 6,
    },
    { id: 'atypical_notes', question: 'If it wasn’t typical - what does a more usual day look like instead?', type: 'text', w: 12 },

    // ── 6. Final sweep ───────────────────────────────────────────────
    { id: 'sec_final_sweep', question: 'Last thing', type: 'section' },
    {
      id: 'anything_else',
      question:
        'Now that you’ve been through the whole day - anything else at all, even small amounts? A biscuit with chai, a spoonful of someone’s dessert, a mouthful while cooking. These little things add up, and we’d rather have the real picture.',
      type: 'text',
      w: 12,
    },
  ],
};

/**
 * 3-Day Food Diary — a PROSPECTIVE record, deliberately unlike the retrospective
 * 24-hour recall. The client writes as they eat, so the data is observation
 * rather than memory.
 *
 * Three design decisions worth stating:
 *   - 2 weekdays + 1 weekend day. Weekend eating differs systematically — later
 *     first meal, more eating out, more shared food — so a diary of three
 *     weekdays quietly under-reports the real week. The contrast IS the clinical
 *     yield, so the day labels say "weekday" and "weekend day" explicitly.
 *   - Each day is ONE `table`, not seven text fields. Seven occasions across
 *     three days as separate inputs is 21 boxes — a wall that gets abandoned
 *     around Day 2 lunch, and abandonment costs more than any field ever gains.
 *     The grid mirrors the paper diary clients already know, and prompts for
 *     time and quantity: the two things free text always drops.
 *   - The per-day note prompts explicitly for festivals, fasting and eating out.
 *     In an Indian diary these are the systematic distorters: an unflagged
 *     fasting day reads as sudden restriction, an unflagged festival as a binge.
 *
 * Only the three day-grids are `required`, and a `table` counts as answered once
 * any single cell is filled — so "leave a row blank if you skipped it" holds.
 */
const FOOD_DIARY_3DAY: StarterForm = {
  key: 'food_diary_3day',
  name: '3-Day Food Diary',
  description:
    'A record of what you actually eat over three days - two weekdays and one weekend day. Please fill it in as you go, not from memory at the end of the day. There are no right answers here: an honest diary is far more useful to us than a tidy one.',
  questions: [
    // ── How to keep the diary ────────────────────────────────────────
    { id: 'sec_how_to', question: 'Before you start - how to keep this diary well', type: 'section' },
    {
      id: 'how_to_note',
      question:
        'A few things that make a diary genuinely useful: write it down right after you eat (a diary filled in at bedtime is a memory test, and memory quietly drops the small things); include every drink - chai, coffee, juice, soft drinks - and the sugar in them; mention the cooking fat if you know it (ghee, oil, butter) and anything added at the table; and give quantity in ordinary household measures - 1 katori dal, 2 rotis, 1 tsp sugar, half a plate rice. Estimates are fine. Please don’t change how you eat because you’re writing it down - we want your normal week, not your best one.',
      type: 'text',
      w: 12,
    },

    // ── Day 1 — weekday ──────────────────────────────────────────────
    { id: 'sec_day1', question: 'Day 1 - a weekday', type: 'section' },
    { id: 'day1_date', question: 'Which date and day of the week is this?', type: 'text', w: 12 },
    {
      id: 'day1_diary',
      question: 'Fill in each occasion you ate or drank something. Leave a row blank if you skipped it - a skipped meal is useful information too.',
      type: 'table',
      w: 12,
      required: true,
      rows: ['Early morning', 'Breakfast', 'Mid-morning', 'Lunch', 'Evening snack', 'Dinner', 'Post-dinner'],
      columns: ['Time', 'What you ate/drank', 'Approx. quantity'],
    },
    {
      id: 'day1_water',
      question: 'How much water did you drink today?',
      type: 'choice',
      options: ['Less than 1 L', '1-2 L', '2-3 L', 'More than 3 L'],
      w: 6,
    },
    {
      id: 'day1_notes',
      question:
        'Anything unusual about today? For example a festival or celebration, a fasting day (Ekadashi, Navratri, Ramadan, Karva Chauth), eating out or ordering in, travel, a work event, or feeling unwell.',
      type: 'text',
      w: 12,
    },

    // ── Day 2 — weekday ──────────────────────────────────────────────
    { id: 'sec_day2', question: 'Day 2 - a second weekday', type: 'section' },
    { id: 'day2_date', question: 'Which date and day of the week is this?', type: 'text', w: 12 },
    {
      id: 'day2_diary',
      question: 'Same again for your second weekday - write it as you go.',
      type: 'table',
      w: 12,
      required: true,
      rows: ['Early morning', 'Breakfast', 'Mid-morning', 'Lunch', 'Evening snack', 'Dinner', 'Post-dinner'],
      columns: ['Time', 'What you ate/drank', 'Approx. quantity'],
    },
    {
      id: 'day2_water',
      question: 'How much water did you drink today?',
      type: 'choice',
      options: ['Less than 1 L', '1-2 L', '2-3 L', 'More than 3 L'],
      w: 6,
    },
    {
      id: 'day2_notes',
      question:
        'Anything unusual about today? Festival or celebration, fasting day, eating out or ordering in, travel, a work event, or feeling unwell.',
      type: 'text',
      w: 12,
    },

    // ── Day 3 — weekend day ──────────────────────────────────────────
    { id: 'sec_day3', question: 'Day 3 - a weekend day', type: 'section' },
    {
      id: 'day3_date',
      question:
        'Which date and day of the week is this? (Please make this a Saturday or Sunday - weekends usually look quite different, and that difference is exactly what we’re looking for.)',
      type: 'text',
      w: 12,
    },
    {
      id: 'day3_diary',
      question: 'Your weekend day. Do record it exactly as it happened - the late breakfast, the outing, the extra chai. That’s the point.',
      type: 'table',
      w: 12,
      required: true,
      rows: ['Early morning', 'Breakfast', 'Mid-morning', 'Lunch', 'Evening snack', 'Dinner', 'Post-dinner'],
      columns: ['Time', 'What you ate/drank', 'Approx. quantity'],
    },
    {
      id: 'day3_water',
      question: 'How much water did you drink today?',
      type: 'choice',
      options: ['Less than 1 L', '1-2 L', '2-3 L', 'More than 3 L'],
      w: 6,
    },
    {
      id: 'day3_notes',
      question:
        'Anything unusual about today? Festival or celebration, fasting day, eating out or ordering in, travel, guests at home, or feeling unwell.',
      type: 'text',
      w: 12,
    },

    // ── Looking back ─────────────────────────────────────────────────
    { id: 'sec_looking_back', question: 'Looking back at your three days', type: 'section' },
    {
      id: 'days_typical',
      question: 'Were these three days typical of how you normally eat?',
      type: 'choice',
      options: ['Yes, fairly typical', 'Somewhat - parts of it were unusual', 'No, quite different from usual'],
      w: 6,
    },
    {
      id: 'what_was_unusual',
      question: 'If anything made them unusual, tell us what - it helps us read the diary properly rather than draw the wrong conclusion.',
      type: 'text',
      w: 12,
    },
    {
      id: 'noticed_anything',
      question: 'Did writing things down make you notice anything about your own eating? (Optional - but often the most interesting answer on this form.)',
      type: 'text',
      w: 12,
    },
  ],
};

/**
 * Follow-up Review — the short form sent before every follow-up consultation.
 *
 * Design constraint: unlike the intake, this form is answered by the SAME client
 * over and over — potentially twenty times in a year. So it only asks what can
 * actually change between two consults. Anything stable (history, allergies,
 * family history, a typical day of eating) belongs in the intake and is
 * deliberately absent; re-asking it trains clients to skim and submit junk.
 *
 * Wording is non-judgemental by design. Clients under-report slipping because
 * they feel they have let the nutritionist down, and an under-reported week is a
 * week the clinician cannot act on. So adherence is asked as how well the plan
 * fit their week rather than how well they followed it, and obstacles are asked
 * about the PLAN's fit with their life — including the reasons an Indian
 * client's plan usually slips: a shared family kitchen they don't control,
 * festivals, guests, and travel.
 *
 * One scale convention throughout: 1–5, low = poor, high = good.
 */
const FOLLOWUP_REVIEW: StarterForm = {
  key: 'followup_review',
  name: 'Follow-up Review',
  description:
    'A quick check-in before your next consultation. It should take two minutes. Please answer honestly rather than ideally - the weeks that did not go to plan are the most useful ones for us to talk about, and nothing here is a test.',
  questions: [
    // ── Since we last spoke ──────────────────────────────────────────
    { id: 'sec_progress', question: 'Since we last spoke', type: 'section' },
    { id: 'weight_kg', question: 'What is your current weight (kg)?', type: 'number', w: 4, required: true },
    {
      id: 'plan_fit',
      question: 'How well did the plan fit into your days? (1 = it rarely fit, 5 = it fit easily)',
      type: 'scale',
      max: 5,
      w: 8,
    },

    // ── How you have been feeling ────────────────────────────────────
    { id: 'sec_feeling', question: 'How you have been feeling', type: 'section' },
    { id: 'energy', question: 'How have your energy levels been? (1 = very low, 5 = very good)', type: 'scale', max: 5, w: 6 },
    { id: 'sleep_quality', question: 'How has your sleep been? (1 = poor, 5 = excellent)', type: 'scale', max: 5, w: 6 },
    { id: 'digestion', question: 'How has your digestion been? (1 = troublesome, 5 = comfortable)', type: 'scale', max: 5, w: 6 },
    {
      id: 'cravings',
      question: 'How have your cravings and hunger been between meals?',
      type: 'choice',
      options: [
        'Settled - I was comfortable between meals',
        'Hungry at certain times of day',
        'Strong cravings (sweet / salty / fried)',
        'Hungrier than before',
        'Less hungry than before',
      ],
      w: 6,
    },

    // ── What worked, and what did not ────────────────────────────────
    { id: 'sec_fit', question: 'What worked, and what did not', type: 'section' },
    {
      id: 'what_worked',
      question: 'What went well, or what are you pleased with? Anything counts - a habit that stuck, a meal you enjoyed, a change you noticed.',
      type: 'text',
      w: 12,
    },
    {
      id: 'what_didnt_fit',
      question:
        'What part of the plan did not fit your life? Tell us what got in the way rather than what you managed - a meal timing that clashed with work, a dish the kitchen at home does not cook, portions decided by someone else, something you did not enjoy eating. This is the most useful thing you can tell us, and it usually means the plan needs changing, not you.',
      type: 'text',
      w: 12,
    },
    {
      id: 'life_events',
      question:
        'Was there anything happening in these weeks that food had to work around? Festivals, a wedding or guests at home, travel or hotel food, fasting days, exams, deadlines, illness - normal life, and we would rather plan for it than ignore it.',
      type: 'text',
      w: 12,
    },

    // ── Anything we should know ──────────────────────────────────────
    { id: 'sec_updates', question: 'Anything we should know', type: 'section' },
    { id: 'health_changes', question: 'Any new symptoms, medicines, supplements, or test results since we last spoke?', type: 'text', w: 12 },
    {
      id: 'for_nutritionist',
      question: 'Anything you would like to ask or raise at this consultation? Doubts, requests, or something you would like changed in the plan.',
      type: 'text',
      w: 12,
    },
  ],
};

/**
 * Lab Results — the client transcribes a blood report so their nutritionist has
 * the actual numbers to work from.
 *
 * A fuller, standalone counterpart to the single `lab_markers` table inside the
 * General Nutritional Assessment, which collapses whole panels into one row
 * ('Total Cholesterol / LDL / HDL / Triglycerides') and so can only ever capture
 * a summary. Here each marker is its own row, grouped into one `table` per panel
 * — panels mirror how Indian labs actually print a report, so the client fills
 * in the block in front of them and skips the rest.
 *
 * Design decisions worth stating:
 *   - TRANSCRIPTION, NOT DIAGNOSIS. No reference-range values, cutoffs, or
 *     interpretation appear anywhere. Ranges legitimately differ between labs
 *     (method, analyser, population, units), so the client copies THEIR lab's
 *     printed range into the 'Reference Range' column. Asserting our own numbers
 *     would be wrong for some labs and, on markers like TSH or HbA1c, actively
 *     unsafe — a client reading "normal" off our form against a range their lab
 *     does not use is a clinical error we would have authored.
 *   - 'Unit' earns its column. Indian labs report the same marker in different
 *     units and a bare number is ambiguous: Vitamin D as ng/mL vs nmol/L differs
 *     by ~2.5x (30 ng/mL is sufficient, 30 nmol/L is deficient); B12 runs pg/mL
 *     vs pmol/L; lipids are mg/dL here but mmol/L on some corporate panels.
 *   - Marker names use the wording Indian labs print — SGPT/SGOT alongside
 *     ALT/AST, "LFT", "KFT" — so a client scanning their page finds the same
 *     words rather than a textbook synonym.
 *   - Row labels are the storage keys (a `table` answer is
 *     `{ [rowLabel]: { [columnHeader]: value } }`), so reordering or inserting a
 *     marker later will not re-map collected answers; RENAMING a row would
 *     orphan them, so treat these strings as fixed once shipped.
 *   - Nothing is `required`. Almost no client has every panel, and a required
 *     field on a report they do not hold would block the form entirely.
 */
const LAB_RESULTS: StarterForm = {
  key: 'lab_results',
  name: 'Lab Results',
  description:
    'Copy the numbers from your blood report so your nutritionist has them to work with. Fill in only the panels your report actually has and leave everything else blank - nothing here is compulsory. Enter the value, the unit and the reference range exactly as printed on your report; ranges vary from lab to lab, so please use your own lab’s.',
  questions: [
    // ── About the report ─────────────────────────────────────────────
    { id: 'sec_report', question: 'About this report', type: 'section' },
    { id: 'report_date', question: 'What is the date on the report?', type: 'text', w: 4 },
    { id: 'lab_name', question: 'Which lab or hospital did the test?', type: 'text', w: 4 },
    {
      id: 'fasting_sample',
      question: 'Was the sample taken fasting?',
      type: 'choice',
      options: ['Yes - fasting', 'No - non-fasting', 'Not sure'],
      w: 4,
    },
    {
      id: 'share_original',
      question:
        'Please also share the original report (PDF or a clear photo) with your nutritionist - it lets them check anything that is unclear here.',
      type: 'yesno',
      w: 12,
    },

    // ── Blood sugar ──────────────────────────────────────────────────
    { id: 'sec_glycaemic', question: 'Blood sugar', type: 'section' },
    {
      id: 'tbl_glycaemic',
      question: 'Fill in whichever of these your report shows, exactly as printed.',
      type: 'table',
      w: 12,
      rows: ['Fasting Blood Glucose (FBS)', 'Post-Prandial Blood Glucose (PPBS)', 'HbA1c', 'Fasting Insulin'],
      columns: ['Result', 'Unit', 'Date', 'Reference Range'],
    },

    // ── Lipid profile ────────────────────────────────────────────────
    { id: 'sec_lipid', question: 'Lipid Profile', type: 'section' },
    {
      id: 'tbl_lipid',
      question: 'Fill in whichever of these your report shows, exactly as printed.',
      type: 'table',
      w: 12,
      rows: ['Total Cholesterol', 'LDL Cholesterol', 'HDL Cholesterol', 'Triglycerides', 'VLDL Cholesterol'],
      columns: ['Result', 'Unit', 'Date', 'Reference Range'],
    },

    // ── Thyroid ──────────────────────────────────────────────────────
    { id: 'sec_thyroid', question: 'Thyroid Profile', type: 'section' },
    {
      id: 'tbl_thyroid',
      question: 'Fill in whichever of these your report shows, exactly as printed.',
      type: 'table',
      w: 12,
      rows: ['TSH', 'T3 (Total)', 'T4 (Total)', 'Free T3 (FT3)', 'Free T4 (FT4)', 'Anti-TPO Antibodies'],
      columns: ['Result', 'Unit', 'Date', 'Reference Range'],
    },

    // ── Vitamins and minerals ────────────────────────────────────────
    { id: 'sec_vitamins', question: 'Vitamins & minerals', type: 'section' },
    {
      id: 'tbl_vitamins',
      question:
        'Fill in whichever of these your report shows. The unit matters especially here - Vitamin D and B12 are reported in different units by different labs, so please copy it as printed.',
      type: 'table',
      w: 12,
      rows: ['Vitamin D (25-OH)', 'Vitamin B12', 'Folate (Folic Acid)', 'Ferritin', 'Serum Iron', 'Calcium (Serum)'],
      columns: ['Result', 'Unit', 'Date', 'Reference Range'],
    },

    // ── Complete Blood Count ─────────────────────────────────────────
    { id: 'sec_haematology', question: 'Complete Blood Count (CBC)', type: 'section' },
    {
      id: 'tbl_haematology',
      question: 'Fill in whichever of these your report shows, exactly as printed.',
      type: 'table',
      w: 12,
      rows: ['Haemoglobin (Hb)', 'Total WBC Count (TLC)', 'Platelet Count', 'MCV'],
      columns: ['Result', 'Unit', 'Date', 'Reference Range'],
    },

    // ── Liver (LFT) ──────────────────────────────────────────────────
    { id: 'sec_lft', question: 'Liver Function Test (LFT)', type: 'section' },
    {
      id: 'tbl_lft',
      question: 'Fill in whichever of these your report shows, exactly as printed.',
      type: 'table',
      w: 12,
      rows: ['SGPT / ALT', 'SGOT / AST', 'Alkaline Phosphatase (ALP)', 'Bilirubin (Total)', 'Albumin'],
      columns: ['Result', 'Unit', 'Date', 'Reference Range'],
    },

    // ── Kidney (KFT) ─────────────────────────────────────────────────
    { id: 'sec_kft', question: 'Kidney Function Test (KFT / RFT)', type: 'section' },
    {
      id: 'tbl_kft',
      question: 'Fill in whichever of these your report shows, exactly as printed.',
      type: 'table',
      w: 12,
      rows: ['Serum Creatinine', 'Blood Urea', 'Uric Acid', 'eGFR'],
      columns: ['Result', 'Unit', 'Date', 'Reference Range'],
    },

    // ── Hormonal panel ───────────────────────────────────────────────
    { id: 'sec_hormonal', question: 'Hormonal panel', type: 'section' },
    {
      id: 'tbl_hormonal',
      question:
        'Often tested for PCOS/PCOD or fertility concerns. Fill in whichever of these your report shows - skip the section if you have not had them done.',
      type: 'table',
      w: 12,
      rows: [
        'Testosterone (Total)',
        'LH (Luteinizing Hormone)',
        'FSH (Follicle Stimulating Hormone)',
        'Prolactin',
        'AMH (Anti-Müllerian Hormone)',
      ],
      columns: ['Result', 'Unit', 'Date', 'Reference Range'],
    },

    // ── Anything else ────────────────────────────────────────────────
    { id: 'sec_other', question: 'Anything else', type: 'section' },
    {
      id: 'other_markers',
      question:
        'Any other tests on your report that are not listed above? Please type the test name, result, unit and reference range as printed.',
      type: 'text',
      w: 12,
    },
    {
      id: 'doctor_flagged',
      question:
        'Did your doctor point out anything on this report, or mark any value as abnormal? Please tell us what they said in their words.',
      type: 'text',
      w: 12,
    },
  ],
};

/**
 * Food Preferences & Restrictions — the hard-constraint layer on meal planning.
 *
 * Everything here is a boundary on what can be prescribed, not a preference to
 * be negotiated later: a plan that violates an answer here is not a suboptimal
 * plan, it is an unusable one.
 *
 * Deliberately India-first, because a generic Western preferences form fails an
 * Indian practice on the first client:
 *   - Diet type carries Eggetarian and Jain, not just veg/non-veg/vegan. Jain is
 *     not a stricter vegetarianism — it excludes root vegetables (onion, garlic,
 *     potato, carrot, radish), which removes the base of most Indian recipes and
 *     rewrites the entire plan. Non-veg is followed up with *which* meats and
 *     *how often*, since a "non-vegetarian" eating mutton twice a month plans
 *     nothing like one eating chicken daily.
 *   - Fasting is a recurring, calendared constraint (Ekadashi, Navratri, Roza,
 *     Shravan, weekly vrat), not an edge case — so it asks what a fast day
 *     actually looks like rather than treating it as a skipped meal.
 *   - Region and staple grain set the pantry: wheat vs rice, mustard oil vs
 *     coconut oil. A plan written in the wrong cuisine gets abandoned quietly.
 *   - The joint-family kitchen problem gets two questions of its own — who cooks,
 *     and whether the client has any say in the menu. A client who does not
 *     decide what is cooked cannot follow an individualised plan, and the
 *     nutritionist has to know that BEFORE prescribing one, rather than reading
 *     it as non-compliance three weeks in.
 *
 * Allergies and diet type are `required` — both are safety-relevant. Everything
 * touching religion, money and family is worded so no answer reads as expected.
 */
const FOOD_PREFERENCES: StarterForm = {
  key: 'food_preferences',
  name: 'Food Preferences & Restrictions',
  description:
    'What you can, can’t and would rather not eat - so your plan is built around your actual kitchen, your beliefs and your tastes. There are no right answers here; the more honest this is, the more usable your plan will be.',
  questions: [
    // ── How you eat ──────────────────────────────────────────────────
    { id: 'sec_diet_type', question: 'How you eat', type: 'section' },
    {
      id: 'diet_type',
      question: 'Which best describes the way you eat?',
      type: 'choice',
      options: ['Vegetarian', 'Non-vegetarian', 'Eggetarian', 'Vegan', 'Jain', 'Mixed / varies'],
      w: 6,
      required: true,
    },
    {
      id: 'diet_type_notes',
      question: 'Anything about that we should understand? (For example, Jain without root vegetables, veg on certain days, recently changed.)',
      type: 'text',
      w: 6,
    },
    {
      id: 'nonveg_items',
      question: 'If you eat non-vegetarian food, which of these do you have?',
      type: 'multi',
      options: ['Chicken', 'Mutton / lamb', 'Fish', 'Prawns / other seafood', 'Eggs', 'Other', 'Not applicable'],
      w: 6,
    },
    {
      id: 'nonveg_frequency',
      question: 'How often do you eat non-vegetarian food?',
      type: 'choice',
      options: ['Daily', '3-5 times a week', '1-2 times a week', 'A few times a month', 'Rarely', 'Never'],
      w: 6,
    },

    // ── Allergies and intolerances ───────────────────────────────────
    { id: 'sec_allergies', question: 'Allergies and intolerances', type: 'section' },
    {
      id: 'allergies',
      question: 'Do you have any food allergies? Please tick everything that applies.',
      type: 'multi',
      options: [
        'Milk / dairy', 'Tree nuts', 'Peanuts', 'Gluten / wheat', 'Soy',
        'Shellfish', 'Fish', 'Eggs', 'Sesame', 'Other', 'None',
      ],
      w: 12,
      required: true,
    },
    { id: 'allergy_details', question: 'For anything you ticked - what happens, and how severe is it?', type: 'text', w: 12 },
    {
      id: 'intolerances',
      question: 'Are there foods that don’t cause an allergic reaction but do upset you - bloating, gas, discomfort?',
      type: 'multi',
      options: [
        'Lactose / milk', 'Gluten / wheat', 'Onion / garlic', 'Beans and pulses',
        'Fried or oily food', 'Spicy food', 'Artificial sweeteners', 'Other', 'None',
      ],
      w: 12,
    },
    { id: 'intolerance_details', question: 'Which food, and what does it do to you?', type: 'text', w: 12 },

    // ── Fasting and religious practice ───────────────────────────────
    { id: 'sec_fasting', question: 'Fasting and religious practice', type: 'section' },
    {
      id: 'fasting_practices',
      question: 'Do you observe any fasts through the year?',
      type: 'multi',
      options: [
        'Ekadashi', 'Navratri', 'Ramadan / Roza', 'Karva Chauth', 'Shravan / Sawan',
        'A weekly fast', 'Jain fasting', 'Lent', 'Other', 'None',
      ],
      w: 12,
    },
    { id: 'fasting_weekly_day', question: 'If you keep a weekly fast, which day is it?', type: 'text', w: 6 },
    { id: 'fasting_pattern', question: 'On a fast day, what does your eating look like? (What you have, what you avoid, and when.)', type: 'text', w: 6 },
    { id: 'religious_restrictions', question: 'Are there foods you avoid for religious or cultural reasons at any time of year?', type: 'text', w: 12 },

    // ── Your kitchen and your region ─────────────────────────────────
    { id: 'sec_kitchen', question: 'Your kitchen and your region', type: 'section' },
    {
      id: 'regional_cuisine',
      question: 'Which cuisines does your everyday cooking come from? Tick all that are in your kitchen.',
      type: 'multi',
      options: [
        'North Indian', 'South Indian', 'East Indian', 'West Indian', 'Bengali',
        'Gujarati', 'Punjabi', 'Maharashtrian', 'Kerala', 'Tamil',
        'Andhra / Telangana', 'Continental / Other',
      ],
      w: 12,
    },
    {
      id: 'staple_grain',
      question: 'What is your staple at main meals?',
      type: 'choice',
      options: ['Mostly chapati / roti', 'Mostly rice', 'Both, roughly equally', 'Millets / other grains', 'Varies by meal'],
      w: 6,
    },
    {
      id: 'who_cooks',
      question: 'Who does the cooking at home?',
      type: 'choice',
      options: ['I do', 'My spouse / partner', 'A parent or in-law', 'A cook or house help', 'Shared between us', 'Mostly ordered in'],
      w: 6,
    },
    {
      id: 'menu_control',
      question: 'How much say do you have in what gets cooked?',
      type: 'choice',
      options: [
        'I decide the menu',
        'I can request changes and they usually happen',
        'Some say - one common menu for the household',
        'Very little say - I eat what is cooked',
      ],
      w: 6,
    },
    {
      id: 'cooking_time',
      question: 'How much time and help do you realistically have for cooking on a working day?',
      type: 'choice',
      options: [
        'Plenty - cooking is not a constraint',
        'Enough for one fresh meal a day',
        'Very little - quick or reheated food only',
        'None - someone else cooks, or I eat out',
      ],
      w: 6,
    },

    // ── Tastes, habits and constraints ───────────────────────────────
    { id: 'sec_tastes', question: 'Tastes, habits and constraints', type: 'section' },
    { id: 'dislikes', question: 'Which foods do you dislike, or simply won’t eat? Be as blunt as you like - we won’t put them in your plan.', type: 'text', w: 6 },
    { id: 'loved_foods', question: 'Which foods do you love, or couldn’t give up? We’d rather build these in than fight them.', type: 'text', w: 6 },
    {
      id: 'eating_out_frequency',
      question: 'How often do you eat out or order in?',
      type: 'choice',
      options: ['Daily or most days', '3-5 times a week', '1-2 times a week', 'A few times a month', 'Rarely'],
      w: 6,
    },
    { id: 'alcohol', question: 'Do you drink alcohol?', type: 'yesno', w: 6 },
    { id: 'alcohol_frequency', question: 'If yes, how often and roughly how much?', type: 'text', w: 6 },
    {
      id: 'budget_constraints',
      question: 'Should we keep your food budget in mind while planning? Most plans work perfectly well either way.',
      type: 'choice',
      options: [
        'Yes - please keep it economical, everyday ingredients only',
        'Somewhat - a few special items are fine, nothing regular',
        'No particular constraint',
        'Prefer not to say',
      ],
      w: 6,
    },
    {
      id: 'planning_notes',
      question:
        'Anything else we should know before planning your meals? Travel, hostel or office canteen food, a shared kitchen, festivals coming up - anything at all.',
      type: 'text',
      w: 12,
    },
  ],
};

export const STARTER_FORMS: StarterForm[] = [
  GENERAL_NUTRITIONAL_ASSESSMENT,
  QUICK_INTAKE,
  DIET_RECALL_24H,
  FOOD_DIARY_3DAY,
  FOLLOWUP_REVIEW,
  LAB_RESULTS,
  FOOD_PREFERENCES,
];

export function starterFormByKey(key: string): StarterForm | undefined {
  return STARTER_FORMS.find((f) => f.key === key);
}
