export type WorkflowStatus = 'active' | 'paused' | 'draft';
export type NodeKind = 'trigger' | 'condition' | 'action';

export interface FlowNode {
  kind: NodeKind;
  label: string;
  detail?: string;
  /** Icon hint */
  icon: 'timer' | 'silent' | 'photo' | 'card' | 'milestone' | 'message' | 'bell' | 'mail' | 'sparkles' | 'flag' | 'calendar' | 'whatsapp' | 'split';
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  /** Flow nodes in order — trigger, then conditions, then actions */
  nodes: FlowNode[];
  /** Total successful runs this month */
  runsThisMonth: number;
  /** 0..100 success rate */
  successRate: number;
  lastRunAt?: string;
  /** Hours saved (illustrative) */
  timeSavedHours: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  accent: 'sage' | 'indigo' | 'sand' | 'coral';
  estimatedRuns: string;
  /** A short preview of the flow */
  nodes: FlowNode[];
}
