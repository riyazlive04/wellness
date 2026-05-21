export interface SpecializationCategory {
  id: string;
  label: string;
  items: string[];
}

export const SPECIALIZATIONS: SpecializationCategory[] = [
  {
    id: 'general_wellness',
    label: 'General Wellness & Fitness',
    items: [
      'Weight Loss',
      'Weight Gain',
      'Muscle Gain',
      'Sports Nutrition',
      'Sports Performance',
      'Bodybuilding Nutrition',
      'Athletic Recovery',
      'Endurance Nutrition',
    ],
  },
  {
    id: 'clinical_medical',
    label: 'Clinical & Medical Nutrition',
    items: [
      'Clinical Nutrition',
      'Diabetes',
      'Hypertension',
      'Cardiac Nutrition',
      'Renal Nutrition',
      'Liver Health',
      'Gut Health',
      'IBS / Digestive Health',
    ],
  },
  {
    id: 'hormonal_womens',
    label: "Hormonal & Women's Health",
    items: ['PCOD / PCOS', 'Thyroid', 'Hormonal Balance'],
  },
  {
    id: 'age_based',
    label: 'Age-Based Nutrition',
    items: ['Pediatric Nutrition', 'Child Nutrition', 'Geriatric Nutrition'],
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle & Specialized Diets',
    items: ['Vegan Nutrition', 'Keto Coaching', 'Ayurvedic Wellness'],
  },
];
