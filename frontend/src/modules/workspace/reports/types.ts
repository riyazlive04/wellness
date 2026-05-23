export type ReportKind =
  | 'client_health'
  | 'client_monthly'
  | 'program_performance'
  | 'workspace_digest'
  | 'billing_gst';

export type ReportStatus = 'ready' | 'generating' | 'queued' | 'failed';

export type Cadence = 'one_off' | 'weekly' | 'monthly';

export interface ReportTemplate {
  kind: ReportKind;
  name: string;
  description: string;
  /** What the report contains (3-4 bullets) */
  contents: string[];
  /** Estimated pages, used for the demo */
  estimatedPages: string;
  /** Color accent */
  accent: 'sage' | 'indigo' | 'sand' | 'coral';
  /** Whether the report needs a target id (e.g. client or program) */
  needsTarget?: 'client' | 'program';
}

export interface GeneratedReport {
  id: string;
  kind: ReportKind;
  templateName: string;
  /** Friendly target (e.g. "Priya Sharma" for a client report) */
  target?: string;
  /** ISO period covered ("Apr 2026" / "Week of Mar 4") */
  period: string;
  generatedAt: string;
  generatedBy: string;
  status: ReportStatus;
  pageCount?: number;
  sizeKb?: number;
}

export interface ScheduledReport {
  id: string;
  kind: ReportKind;
  templateName: string;
  cadence: Cadence;
  /** Day-of-week (0=Sun) or day-of-month — interpretation depends on cadence */
  dayOf: number;
  hourOf: number;
  recipients: string[];
  lastSentAt?: string;
  nextRunAt: string;
}
