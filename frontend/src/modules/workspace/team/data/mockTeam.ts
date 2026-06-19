import type { Capability, TeamMember } from '../types';

const day = 1000 * 60 * 60 * 24;
const now = Date.now();

export const MOCK_TEAM: TeamMember[] = [
  {
    id: 'tm_owner',
    name: 'You',
    email: 'you@yourpractice.com',
    role: 'owner',
    status: 'active',
    joinedAt: new Date(now - 120 * day).toISOString(),
    lastActiveAt: new Date(now - 30 * 1000).toISOString(),
    assignedClients: 5,
    specializations: ['PCOD / PCOS', 'Diabetes', 'Weight Loss'],
  },
  {
    id: 'tm_vanya',
    name: 'Dr. Vanya Pillai',
    email: 'vanya@yourpractice.com',
    role: 'nutritionist',
    status: 'active',
    joinedAt: new Date(now - 75 * day).toISOString(),
    lastActiveAt: new Date(now - 35 * 60 * 1000).toISOString(),
    assignedClients: 4,
    specializations: ['Clinical Nutrition', 'Cardiac Nutrition', 'Hypertension'],
  },
  {
    id: 'tm_aditya',
    name: 'Aditya Rao',
    email: 'aditya@yourpractice.com',
    role: 'coach',
    status: 'active',
    joinedAt: new Date(now - 28 * day).toISOString(),
    lastActiveAt: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
    assignedClients: 3,
    specializations: ['Muscle Gain', 'Sports Performance', 'Athletic Recovery'],
  },
  {
    id: 'tm_sneha_invited',
    name: 'Sneha Bose',
    email: 'sneha.bose@example.com',
    role: 'coach',
    status: 'invited',
    joinedAt: new Date(now - 2 * day).toISOString(),
    assignedClients: 0,
    specializations: [],
  },
];

export const CAPABILITIES: Capability[] = [
  {
    id: 'manage_own_clients',
    label: 'Manage their own clients',
    description: 'View, message, log, edit programs for clients assigned to them.',
    matrix: { owner: 'full', nutritionist: 'full', coach: 'full' },
  },
  {
    id: 'manage_all_clients',
    label: 'See and manage all clients',
    description: 'Full read/write across every client in the workspace.',
    matrix: { owner: 'full', nutritionist: 'full', coach: 'none' },
  },
  {
    id: 'create_programs',
    label: 'Create + edit programs',
    description: 'Build new program templates and modify shared ones.',
    matrix: { owner: 'full', nutritionist: 'full', coach: 'partial' },
  },
  {
    id: 'bulk_messaging',
    label: 'Send bulk messages',
    description: 'Send to all or filtered groups of clients at once.',
    matrix: { owner: 'full', nutritionist: 'full', coach: 'none' },
  },
  {
    id: 'access_billing',
    label: 'View invoices + billing',
    description: 'Access plan, GST invoices, payment methods.',
    matrix: { owner: 'full', nutritionist: 'none', coach: 'none' },
  },
  {
    id: 'manage_team',
    label: 'Invite + remove team members',
    description: 'Add new coaches/nutritionists and change their roles.',
    matrix: { owner: 'full', nutritionist: 'none', coach: 'none' },
  },
  {
    id: 'configure_integrations',
    label: 'Configure integrations',
    description: 'Connect WhatsApp, calendar, payment gateway, etc.',
    matrix: { owner: 'full', nutritionist: 'partial', coach: 'none' },
  },
  {
    id: 'see_analytics',
    label: 'View analytics + reports',
    description: 'Workspace-wide engagement and performance dashboards.',
    matrix: { owner: 'full', nutritionist: 'full', coach: 'partial' },
  },
];
