import type { GeneratedReport, ReportTemplate, ScheduledReport } from '../types';

const min = 1000 * 60;
const hr = min * 60;
const day = hr * 24;
const now = Date.now();
const iso = (offset: number) => new Date(now - offset).toISOString();
const isoFuture = (offset: number) => new Date(now + offset).toISOString();

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    kind: 'client_health',
    name: 'Client Health Report',
    description:
      'Comprehensive PDF for a single client - share with them or with their referring doctor.',
    contents: [
      'Profile + program + goals',
      'Compliance + assessment scores trend',
      'Meal patterns + nutrient summary',
      'Coach\'s notes + next-quarter plan',
    ],
    estimatedPages: '6-8 pages',
    accent: 'sage',
    needsTarget: 'client',
  },
  {
    kind: 'client_monthly',
    name: 'Client Monthly Summary',
    description:
      'Lighter monthly recap. One-pager designed to land in a client\'s inbox each month.',
    contents: [
      'Wins this month',
      'Adherence + streak summary',
      'AI insight for the next month',
      'Single-question check-in CTA',
    ],
    estimatedPages: '1 page',
    accent: 'indigo',
    needsTarget: 'client',
  },
  {
    kind: 'program_performance',
    name: 'Program Performance',
    description:
      'How a program template is doing across all enrolled clients. Use to refine your curriculum.',
    contents: [
      'Enrollment + dropout funnel',
      'Avg adherence + completion rate',
      'Common stumbling blocks',
      'AI-flagged opportunities',
    ],
    estimatedPages: '4 pages',
    accent: 'indigo',
    needsTarget: 'program',
  },
  {
    kind: 'workspace_digest',
    name: 'Workspace Digest',
    description:
      'Weekly or monthly snapshot of the whole practice - momentum, risks, AI usage, top performers.',
    contents: [
      'KPIs vs prior period',
      'Top performers + needs-attention list',
      'Engagement heatmap',
      'Programs ranked by performance',
    ],
    estimatedPages: '3 pages',
    accent: 'sand',
  },
  {
    kind: 'billing_gst',
    name: 'Billing & GST Report',
    description:
      'Per-month invoice + GST summary for accountant or audit. Includes CGST/SGST/IGST split.',
    contents: [
      'All invoices issued + status',
      'GST collected (CGST/SGST/IGST)',
      'Failed payments + recovery state',
      'Razorpay reconciliation IDs',
    ],
    estimatedPages: '2 pages',
    accent: 'coral',
  },
];

export const GENERATED: GeneratedReport[] = [
  {
    id: 'rep_001',
    kind: 'client_health',
    templateName: 'Client Health Report',
    target: 'Priya Sharma',
    period: 'Q1 2026',
    generatedAt: iso(2 * hr),
    generatedBy: 'You',
    status: 'ready',
    pageCount: 7,
    sizeKb: 624,
  },
  {
    id: 'rep_002',
    kind: 'workspace_digest',
    templateName: 'Workspace Digest',
    period: 'Week of 4 May',
    generatedAt: iso(1 * day),
    generatedBy: 'SIRAH LIFE (auto)',
    status: 'ready',
    pageCount: 3,
    sizeKb: 412,
  },
  {
    id: 'rep_003',
    kind: 'billing_gst',
    templateName: 'Billing & GST Report',
    period: 'April 2026',
    generatedAt: iso(2 * day),
    generatedBy: 'You',
    status: 'ready',
    pageCount: 2,
    sizeKb: 218,
  },
  {
    id: 'rep_004',
    kind: 'program_performance',
    templateName: 'Program Performance',
    target: 'PCOS Reset',
    period: 'Last 90 days',
    generatedAt: iso(3 * day),
    generatedBy: 'You',
    status: 'ready',
    pageCount: 4,
    sizeKb: 388,
  },
  {
    id: 'rep_005',
    kind: 'client_monthly',
    templateName: 'Client Monthly Summary',
    target: 'Karan Singh',
    period: 'April 2026',
    generatedAt: iso(5 * day),
    generatedBy: 'You',
    status: 'ready',
    pageCount: 1,
    sizeKb: 142,
  },
  {
    id: 'rep_006',
    kind: 'client_health',
    templateName: 'Client Health Report',
    target: 'Aanya Iyer',
    period: 'Q1 2026',
    generatedAt: iso(45 * min),
    generatedBy: 'You',
    status: 'generating',
  },
  {
    id: 'rep_007',
    kind: 'program_performance',
    templateName: 'Program Performance',
    target: 'Weight Loss 12w',
    period: 'Last 90 days',
    generatedAt: iso(10 * min),
    generatedBy: 'You',
    status: 'queued',
  },
];

export const SCHEDULED: ScheduledReport[] = [
  {
    id: 'sch_001',
    kind: 'workspace_digest',
    templateName: 'Workspace Digest',
    cadence: 'weekly',
    dayOf: 1,           // Monday
    hourOf: 7,          // 7 AM
    recipients: ['you@yourpractice.com'],
    lastSentAt: iso(1 * day),
    nextRunAt: isoFuture(6 * day),
  },
  {
    id: 'sch_002',
    kind: 'billing_gst',
    templateName: 'Billing & GST Report',
    cadence: 'monthly',
    dayOf: 1,           // 1st of month
    hourOf: 9,
    recipients: ['you@yourpractice.com', 'accountant@example.com'],
    lastSentAt: iso(20 * day),
    nextRunAt: isoFuture(10 * day),
  },
];
