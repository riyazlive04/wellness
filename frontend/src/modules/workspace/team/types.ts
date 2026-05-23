export type MemberRole = 'owner' | 'manager' | 'coach';
export type MemberStatus = 'active' | 'invited' | 'disabled';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string;            // ISO
  lastActiveAt?: string;       // ISO; undefined for pending invites
  /** Number of clients this member is the primary coach for */
  assignedClients: number;
  /** Self-selected specializations (subset of the workspace specs) */
  specializations: string[];
}

export interface Capability {
  id: string;
  label: string;
  description: string;
  /** What each role can do: full / partial / none */
  matrix: Record<MemberRole, 'full' | 'partial' | 'none'>;
}
