export type AppointmentType = 'video' | 'phone' | 'in_person';
export type AppointmentKind = 'initial' | 'follow_up' | 'monthly_review' | 'urgent' | 'group';
export type AppointmentStatus = 'scheduled' | 'completed' | 'canceled';

export interface Appointment {
  id: string;
  clientId: string;          // matches MOCK_CLIENTS ids ('' for group sessions)
  clientName: string;
  program: string;
  type: AppointmentType;
  kind: AppointmentKind;
  status: AppointmentStatus;
  startAt: string;           // ISO
  durationMin: number;
  notes?: string;            // owner-private notes
  /** AI pre-call brief (mocked) */
  aiBrief?: string;
}
