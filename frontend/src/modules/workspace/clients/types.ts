export type ClientStatus = 'active' | 'at_risk' | 'paused' | 'pending_invite';

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: ClientStatus;
  program: string;        // e.g. "PCOS Reset"
  programWeek: number;    // 0 if pending invite
  programTotal: number;   // 30, 60, 90
  compliance: number;     // 0..100
  lastActivityAt: string; // ISO date
  joinedAt: string;       // ISO date
  trend: 'up' | 'down' | 'flat';
  goals: string[];
  /** Tag for filtering by specialization */
  specialization: string;
}

export interface InvitePayload {
  name: string;
  contact: string;
  channel: 'whatsapp' | 'email';
  programId?: string;
}
