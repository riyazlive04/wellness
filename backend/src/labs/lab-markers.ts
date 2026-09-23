/**
 * Lab marker catalogue — the bridge between what a client types off a report and
 * a stable code we can trend, chart and query.
 *
 * Every `row` label in the `lab_results` starter form
 * (../clients/starter-forms.ts) resolves through here, plus the aliases Indian
 * labs actually print (SGPT vs ALT, TLC vs WBC, KFT vs RFT). Matching runs on a
 * normalised form of the label, so punctuation and case never matter.
 *
 * `fallbackRef` is a conservative adult reference range used ONLY when the
 * client's own report did not carry one. It never overrides a range the client
 * entered: ranges vary by lab, assay and population, and flagging someone
 * against a range their lab did not use is worse than not flagging at all.
 * Anything genuinely sex- or age-specific is left null rather than guessed.
 */

export type LabPanel =
  | 'glycaemic'
  | 'lipid'
  | 'thyroid'
  | 'vitamins'
  | 'cbc'
  | 'lft'
  | 'kft'
  | 'hormonal'
  | 'other';

export const LAB_PANELS: Array<{ code: LabPanel; label: string }> = [
  { code: 'glycaemic', label: 'Blood sugar' },
  { code: 'lipid', label: 'Lipid profile' },
  { code: 'thyroid', label: 'Thyroid profile' },
  { code: 'vitamins', label: 'Vitamins & minerals' },
  { code: 'cbc', label: 'Complete blood count' },
  { code: 'lft', label: 'Liver function' },
  { code: 'kft', label: 'Kidney function' },
  { code: 'hormonal', label: 'Hormonal panel' },
  { code: 'other', label: 'Other' },
];

export interface LabMarker {
  code: string;
  label: string;
  panel: LabPanel;
  /** Canonical unit, used when the report omitted one. */
  unit: string | null;
  /** Conservative adult range; null where it is genuinely sex/age/assay dependent. */
  fallbackRef: { low: number | null; high: number | null } | null;
  /** Higher is worse (true), lower is worse (false), or neither (null). Drives trend arrows. */
  higherIsWorse: boolean | null;
  aliases: string[];
}

export const LAB_MARKERS: LabMarker[] = [
  // Blood sugar
  {
    code: 'fbs', label: 'Fasting Blood Glucose (FBS)', panel: 'glycaemic', unit: 'mg/dL',
    fallbackRef: { low: 70, high: 99 }, higherIsWorse: true,
    aliases: ['fasting blood glucose', 'fasting blood sugar', 'fbs', 'fbg', 'glucose fasting', 'fasting glucose'],
  },
  {
    code: 'ppbs', label: 'Post-Prandial Blood Glucose (PPBS)', panel: 'glycaemic', unit: 'mg/dL',
    fallbackRef: { low: null, high: 140 }, higherIsWorse: true,
    aliases: ['post prandial blood glucose', 'post prandial blood sugar', 'ppbs', 'ppbg', 'pp glucose', 'postprandial glucose'],
  },
  {
    code: 'hba1c', label: 'HbA1c', panel: 'glycaemic', unit: '%',
    fallbackRef: { low: null, high: 5.6 }, higherIsWorse: true,
    aliases: ['hba1c', 'hb a1c', 'glycated haemoglobin', 'glycated hemoglobin', 'glycosylated haemoglobin', 'a1c'],
  },
  {
    code: 'fasting_insulin', label: 'Fasting Insulin', panel: 'glycaemic', unit: 'uIU/mL',
    fallbackRef: { low: 2, high: 25 }, higherIsWorse: true,
    aliases: ['fasting insulin', 'insulin fasting', 'serum insulin'],
  },

  // Lipid profile
  {
    code: 'total_cholesterol', label: 'Total Cholesterol', panel: 'lipid', unit: 'mg/dL',
    fallbackRef: { low: null, high: 200 }, higherIsWorse: true,
    aliases: ['total cholesterol', 'cholesterol total', 'serum cholesterol', 'cholesterol'],
  },
  {
    code: 'ldl', label: 'LDL Cholesterol', panel: 'lipid', unit: 'mg/dL',
    fallbackRef: { low: null, high: 100 }, higherIsWorse: true,
    aliases: ['ldl cholesterol', 'ldl', 'ldl c', 'low density lipoprotein'],
  },
  {
    code: 'hdl', label: 'HDL Cholesterol', panel: 'lipid', unit: 'mg/dL',
    fallbackRef: { low: 40, high: null }, higherIsWorse: false,
    aliases: ['hdl cholesterol', 'hdl', 'hdl c', 'high density lipoprotein'],
  },
  {
    code: 'triglycerides', label: 'Triglycerides', panel: 'lipid', unit: 'mg/dL',
    fallbackRef: { low: null, high: 150 }, higherIsWorse: true,
    aliases: ['triglycerides', 'triglyceride', 'tg', 'serum triglycerides'],
  },
  {
    code: 'vldl', label: 'VLDL Cholesterol', panel: 'lipid', unit: 'mg/dL',
    fallbackRef: { low: null, high: 30 }, higherIsWorse: true,
    aliases: ['vldl cholesterol', 'vldl', 'very low density lipoprotein'],
  },

  // Thyroid
  {
    code: 'tsh', label: 'TSH', panel: 'thyroid', unit: 'uIU/mL',
    fallbackRef: { low: 0.4, high: 4.0 }, higherIsWorse: null,
    aliases: ['tsh', 'thyroid stimulating hormone', 'thyrotropin'],
  },
  {
    code: 't3_total', label: 'T3 (Total)', panel: 'thyroid', unit: 'ng/dL',
    fallbackRef: null, higherIsWorse: null,
    aliases: ['t3 total', 'total t3', 't3', 'triiodothyronine'],
  },
  {
    code: 't4_total', label: 'T4 (Total)', panel: 'thyroid', unit: 'ug/dL',
    fallbackRef: null, higherIsWorse: null,
    aliases: ['t4 total', 'total t4', 't4', 'thyroxine'],
  },
  {
    code: 'ft3', label: 'Free T3 (FT3)', panel: 'thyroid', unit: 'pg/mL',
    fallbackRef: null, higherIsWorse: null,
    aliases: ['free t3', 'ft3', 'free triiodothyronine'],
  },
  {
    code: 'ft4', label: 'Free T4 (FT4)', panel: 'thyroid', unit: 'ng/dL',
    fallbackRef: null, higherIsWorse: null,
    aliases: ['free t4', 'ft4', 'free thyroxine'],
  },
  {
    code: 'anti_tpo', label: 'Anti-TPO Antibodies', panel: 'thyroid', unit: 'IU/mL',
    fallbackRef: null, higherIsWorse: true,
    aliases: ['anti tpo antibodies', 'anti tpo', 'tpo antibody', 'antithyroid peroxidase', 'anti thyroid peroxidase'],
  },

  // Vitamins & minerals
  {
    code: 'vitamin_d', label: 'Vitamin D (25-OH)', panel: 'vitamins', unit: 'ng/mL',
    fallbackRef: { low: 30, high: 100 }, higherIsWorse: false,
    aliases: ['vitamin d 25 oh', 'vitamin d', 'vit d', '25 oh vitamin d', '25 hydroxy vitamin d', 'calcidiol'],
  },
  {
    code: 'vitamin_b12', label: 'Vitamin B12', panel: 'vitamins', unit: 'pg/mL',
    fallbackRef: { low: 200, high: 900 }, higherIsWorse: false,
    aliases: ['vitamin b12', 'vit b12', 'b12', 'cobalamin'],
  },
  {
    code: 'folate', label: 'Folate (Folic Acid)', panel: 'vitamins', unit: 'ng/mL',
    fallbackRef: { low: 3, high: null }, higherIsWorse: false,
    aliases: ['folate folic acid', 'folate', 'folic acid', 'serum folate'],
  },
  {
    code: 'ferritin', label: 'Ferritin', panel: 'vitamins', unit: 'ng/mL',
    fallbackRef: null, higherIsWorse: null,
    aliases: ['ferritin', 'serum ferritin'],
  },
  {
    code: 'serum_iron', label: 'Serum Iron', panel: 'vitamins', unit: 'ug/dL',
    fallbackRef: null, higherIsWorse: null,
    aliases: ['serum iron', 'iron'],
  },
  {
    code: 'calcium', label: 'Calcium (Serum)', panel: 'vitamins', unit: 'mg/dL',
    fallbackRef: { low: 8.5, high: 10.5 }, higherIsWorse: null,
    aliases: ['calcium serum', 'serum calcium', 'calcium', 'total calcium'],
  },

  // Complete blood count
  {
    code: 'haemoglobin', label: 'Haemoglobin (Hb)', panel: 'cbc', unit: 'g/dL',
    fallbackRef: null, higherIsWorse: false,
    aliases: ['haemoglobin hb', 'haemoglobin', 'hemoglobin', 'hb', 'hgb'],
  },
  {
    code: 'tlc', label: 'Total WBC Count (TLC)', panel: 'cbc', unit: 'cells/uL',
    fallbackRef: { low: 4000, high: 11000 }, higherIsWorse: null,
    aliases: ['total wbc count tlc', 'total wbc count', 'tlc', 'wbc', 'total leucocyte count', 'white blood cell count'],
  },
  {
    code: 'platelets', label: 'Platelet Count', panel: 'cbc', unit: 'cells/uL',
    fallbackRef: { low: 150000, high: 450000 }, higherIsWorse: null,
    aliases: ['platelet count', 'platelets', 'plt'],
  },
  {
    code: 'mcv', label: 'MCV', panel: 'cbc', unit: 'fL',
    fallbackRef: { low: 80, high: 100 }, higherIsWorse: null,
    aliases: ['mcv', 'mean corpuscular volume'],
  },

  // Liver function
  {
    code: 'alt', label: 'SGPT / ALT', panel: 'lft', unit: 'U/L',
    fallbackRef: { low: null, high: 40 }, higherIsWorse: true,
    aliases: ['sgpt alt', 'sgpt', 'alt', 'alanine aminotransferase', 'alanine transaminase'],
  },
  {
    code: 'ast', label: 'SGOT / AST', panel: 'lft', unit: 'U/L',
    fallbackRef: { low: null, high: 40 }, higherIsWorse: true,
    aliases: ['sgot ast', 'sgot', 'ast', 'aspartate aminotransferase', 'aspartate transaminase'],
  },
  {
    code: 'alp', label: 'Alkaline Phosphatase (ALP)', panel: 'lft', unit: 'U/L',
    fallbackRef: null, higherIsWorse: true,
    aliases: ['alkaline phosphatase alp', 'alkaline phosphatase', 'alp'],
  },
  {
    code: 'bilirubin_total', label: 'Bilirubin (Total)', panel: 'lft', unit: 'mg/dL',
    fallbackRef: { low: null, high: 1.2 }, higherIsWorse: true,
    aliases: ['bilirubin total', 'total bilirubin', 'bilirubin', 'serum bilirubin'],
  },
  {
    code: 'albumin', label: 'Albumin', panel: 'lft', unit: 'g/dL',
    fallbackRef: { low: 3.5, high: 5.2 }, higherIsWorse: false,
    aliases: ['albumin', 'serum albumin'],
  },

  // Kidney function
  {
    code: 'creatinine', label: 'Serum Creatinine', panel: 'kft', unit: 'mg/dL',
    fallbackRef: null, higherIsWorse: true,
    aliases: ['serum creatinine', 'creatinine', 's creatinine'],
  },
  {
    code: 'urea', label: 'Blood Urea', panel: 'kft', unit: 'mg/dL',
    fallbackRef: { low: 15, high: 45 }, higherIsWorse: true,
    aliases: ['blood urea', 'urea', 'serum urea', 'bun'],
  },
  {
    code: 'uric_acid', label: 'Uric Acid', panel: 'kft', unit: 'mg/dL',
    fallbackRef: null, higherIsWorse: true,
    aliases: ['uric acid', 'serum uric acid'],
  },
  {
    code: 'egfr', label: 'eGFR', panel: 'kft', unit: 'mL/min/1.73m2',
    fallbackRef: { low: 90, high: null }, higherIsWorse: false,
    aliases: ['egfr', 'gfr', 'estimated gfr', 'estimated glomerular filtration rate'],
  },

  // Hormonal
  {
    code: 'testosterone_total', label: 'Testosterone (Total)', panel: 'hormonal', unit: 'ng/dL',
    fallbackRef: null, higherIsWorse: null,
    aliases: ['testosterone total', 'total testosterone', 'testosterone'],
  },
  {
    code: 'lh', label: 'LH (Luteinizing Hormone)', panel: 'hormonal', unit: 'mIU/mL',
    fallbackRef: null, higherIsWorse: null,
    aliases: ['lh luteinizing hormone', 'lh', 'luteinizing hormone', 'luteinising hormone'],
  },
  {
    code: 'fsh', label: 'FSH (Follicle Stimulating Hormone)', panel: 'hormonal', unit: 'mIU/mL',
    fallbackRef: null, higherIsWorse: null,
    aliases: ['fsh follicle stimulating hormone', 'fsh', 'follicle stimulating hormone'],
  },
  {
    code: 'prolactin', label: 'Prolactin', panel: 'hormonal', unit: 'ng/mL',
    fallbackRef: null, higherIsWorse: null,
    aliases: ['prolactin', 'serum prolactin', 'prl'],
  },
  {
    code: 'amh', label: 'AMH (Anti-Mullerian Hormone)', panel: 'hormonal', unit: 'ng/mL',
    fallbackRef: null, higherIsWorse: null,
    aliases: ['amh anti mullerian hormone', 'amh', 'anti mullerian hormone'],
  },
];

/**
 * Normalise a label for matching: lowercase, strip accents, collapse every run
 * of non-alphanumerics to one space. 'SGPT / ALT' and 'sgpt-alt' both land on
 * 'sgpt alt', and 'Anti-Mullerian' matches whether or not the u carries an
 * umlaut.
 */
export function normaliseMarkerLabel(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const BY_CODE = new Map<string, LabMarker>();
const BY_LABEL = new Map<string, LabMarker>();
for (const m of LAB_MARKERS) {
  BY_CODE.set(m.code, m);
  BY_LABEL.set(normaliseMarkerLabel(m.label), m);
  for (const a of m.aliases) {
    const key = normaliseMarkerLabel(a);
    // First definition wins: 'cholesterol' belongs to Total Cholesterol, and a
    // later marker listing it as a loose alias must not steal it.
    if (!BY_LABEL.has(key)) BY_LABEL.set(key, m);
  }
}

/** Resolve a row label, alias or code to a catalogue marker. */
export function findMarker(raw: string): LabMarker | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return BY_CODE.get(trimmed) ?? BY_LABEL.get(normaliseMarkerLabel(trimmed)) ?? null;
}

export function markerByCode(code: string): LabMarker | null {
  return BY_CODE.get(code) ?? null;
}

export function panelLabel(panel: string): string {
  return LAB_PANELS.find((p) => p.code === panel)?.label ?? 'Other';
}
