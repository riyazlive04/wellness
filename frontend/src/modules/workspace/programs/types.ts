export interface WeekPlan {
  week: number;
  theme: string;
  focusAreas: string[];
  /** 2-3 short highlights of what the client does this week */
  highlights: string[];
}

export interface Program {
  id: string;
  name: string;
  description: string;
  specialization: string;
  durationWeeks: number;
  goals: string[];
  aiAssisted: boolean;
  /** True if the program isn't yet assigned to any client */
  isTemplate: boolean;
  /** Cached rollups — would come from analytics in prod */
  enrolledCount: number;
  avgCompliance: number;     // 0..100
  completionRate: number;    // 0..100
  curriculum: WeekPlan[];
  /** Accent palette key for visual differentiation */
  accent: 'sage' | 'indigo' | 'sand' | 'coral';
  updatedAt: string;
}

export type ProgramFilter = 'all' | 'active' | 'templates' | 'ai';
