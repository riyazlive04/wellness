import type {
  AiUsageSlice,
  DailyPoint,
  DistributionBand,
  ProgramPerf,
  TopPerformer,
} from '../types';

const day = 1000 * 60 * 60 * 24;
const now = Date.now();

/**
 * Build a 90-day synthetic series. Slight upward trend with realistic noise
 * and weekly cyclicality so charts look credible without faking too much.
 */
function buildSeries(): DailyPoint[] {
  const out: DailyPoint[] = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date(now - i * day);
    const dayOfWeek = date.getDay();           // 0=Sun .. 6=Sat
    const weekendDamp = dayOfWeek === 0 || dayOfWeek === 6 ? 0.78 : 1;
    const trend = 1 + (89 - i) / 280;          // small linear growth
    const noise = 0.85 + Math.sin(i * 0.5) * 0.12 + (i % 3) * 0.04;

    const activeBase = 9 * weekendDamp * trend * noise;
    const aiBase     = 80 * weekendDamp * trend * noise;
    const msgBase    = 22 * weekendDamp * trend * noise;
    const mealBase   = 34 * weekendDamp * trend * noise;
    const complBase  = 78 + (89 - i) / 14 - (dayOfWeek === 0 ? 4 : 0);

    out.push({
      date: date.toISOString().slice(0, 10),
      activeClients: Math.round(activeBase),
      aiCalls:       Math.round(aiBase),
      messagesSent:  Math.round(msgBase),
      mealsLogged:   Math.round(mealBase),
      complianceAvg: Math.round(Math.min(95, Math.max(60, complBase))),
    });
  }
  return out;
}

export const MOCK_SERIES: DailyPoint[] = buildSeries();

export function sliceSeries(range: '7d' | '30d' | '90d'): DailyPoint[] {
  const n = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return MOCK_SERIES.slice(-n);
}

/**
 * Activity heatmap — 7 days × 24 hours, counts of client interactions.
 * Higher density in morning (7–10), afternoon (13–15), evening (19–21).
 */
export function buildHeatmap(): number[][] {
  const grid: number[][] = [];
  for (let dow = 0; dow < 7; dow++) {
    const row: number[] = [];
    for (let h = 0; h < 24; h++) {
      let v = 0;
      if (h >= 6 && h <= 9)   v = 8 + ((dow + h) % 4);
      else if (h === 10)      v = 6;
      else if (h === 11)      v = 4;
      else if (h === 12)      v = 6;
      else if (h >= 13 && h <= 15) v = 7 + (dow % 3);
      else if (h === 16)      v = 5;
      else if (h === 17)      v = 4;
      else if (h === 18)      v = 6;
      else if (h >= 19 && h <= 21) v = 9 + ((h + dow) % 3);
      else if (h === 22)      v = 4;
      else if (h === 23 || h === 0) v = 2;
      else                     v = 1;
      // Weekend slight damp
      if (dow === 0 || dow === 6) v = Math.round(v * 0.75);
      row.push(v);
    }
    grid.push(row);
  }
  return grid;
}

export const MOCK_HEATMAP = buildHeatmap();
export const HEATMAP_MAX = Math.max(...MOCK_HEATMAP.flat());

export const COMPLIANCE_DISTRIBUTION: DistributionBand[] = [
  { label: '0-25%',   count: 1, band: 0.1 },
  { label: '25-50%',  count: 2, band: 0.4 },
  { label: '50-75%',  count: 3, band: 0.65 },
  { label: '75-100%', count: 6, band: 0.95 },
];

export const PROGRAM_PERFORMANCE: ProgramPerf[] = [
  { name: 'PCOS Reset',          enrolled: 4, completion: 78, adherence: 86, accent: 'sage' },
  { name: 'Weight Loss 12w',     enrolled: 6, completion: 62, adherence: 71, accent: 'indigo' },
  { name: 'Diabetes Care',       enrolled: 3, completion: 70, adherence: 84, accent: 'sand' },
  { name: 'Muscle Gain',         enrolled: 2, completion: 84, adherence: 92, accent: 'indigo' },
  { name: 'Endurance Training',  enrolled: 1, completion: 42, adherence: 58, accent: 'coral' },
  { name: 'Thyroid Support',     enrolled: 1, completion: 58, adherence: 76, accent: 'sand' },
];

export const AI_USAGE: AiUsageSlice[] = [
  { feature: 'plate_vision', label: 'Plate Vision',  calls: 540, color: '#7DBE9D' },
  { feature: 'voice',        label: 'Voice AI',      calls: 384, color: '#8087FF' },
  { feature: 'plan_gen',     label: 'Plan drafting', calls: 220, color: '#E5C58C' },
  { feature: 'messaging',    label: 'Smart replies', calls: 102, color: '#F87171' },
  { feature: 'analytics',    label: 'Insights',      calls: 38,  color: '#A5ABFF' },
];

export const TOP_PERFORMERS: TopPerformer[] = [
  { clientId: 'c_karan', name: 'Karan Singh',  compliance: 95, streak: 18, program: 'Muscle Gain' },
  { clientId: 'c_meera', name: 'Meera Nair',   compliance: 100, streak: 4, program: 'Cardiac Care' },
  { clientId: 'c_priya', name: 'Priya Sharma', compliance: 92, streak: 14, program: 'PCOS Reset' },
  { clientId: 'c_sneha', name: 'Sneha Rao',    compliance: 90, streak: 12, program: 'Vegan Strength' },
  { clientId: 'c_aanya', name: 'Aanya Iyer',   compliance: 88, streak: 10, program: 'Diabetes Care' },
];
