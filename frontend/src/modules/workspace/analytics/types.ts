export type TimeRange = '7d' | '30d' | '90d';

export interface DailyPoint {
  date: string;          // ISO yyyy-mm-dd
  activeClients: number;
  aiCalls: number;
  messagesSent: number;
  mealsLogged: number;
  complianceAvg: number; // 0..100
}

export interface DistributionBand {
  label: string;
  count: number;
  /** 0..1 normalized for color tier */
  band: number;
}

export interface ProgramPerf {
  name: string;
  enrolled: number;
  completion: number;    // 0..100
  adherence: number;     // 0..100
  accent: 'sage' | 'indigo' | 'sand' | 'coral';
}

export interface AiUsageSlice {
  feature: 'plate_vision' | 'voice' | 'plan_gen' | 'messaging' | 'analytics';
  label: string;
  calls: number;
  color: string;         // CSS color
}

export interface TopPerformer {
  clientId: string;
  name: string;
  compliance: number;
  streak: number;        // days
  program: string;
}
