import type { WorkspaceMemberRole } from './types/auth-user.type';

/**
 * Fine-grained permission catalog (Module 2 — Permission Management).
 *
 * Permissions are `resource.action` strings. Routes declare what they need with
 * @RequirePermission(...); the RolesGuard checks the caller's EFFECTIVE
 * permissions (role defaults ± per-user overrides), resolved once in
 * JwtStrategy and attached to AuthUser.permissions.
 *
 * Extend by adding a string here + granting it in ROLE_PERMISSIONS. Nothing
 * else needs to change — the matrix is data, not code.
 */
export const PERMISSIONS = [
  'clients.read',
  'clients.write',
  'clients.delete',
  'programs.read',
  'programs.write',
  'recipes.read',
  'recipes.write',
  'messaging.use',
  'appointments.manage',
  'ai.use',
  'analytics.view',
  'reports.view',
  'automation.manage',
  'billing.manage',
  'team.manage',
  'settings.manage',
  'audit.view',
  // Secondary feature areas — surfaced as their own toggles in the editor.
  'assessments.manage',
  'food_library.view',
  'plate_review.use',
  'ai_ecosystem.view',
  'collaborate.use',
  'community.use',
  'announcements.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Grouping for the admin UI — resource → its actions. */
export const PERMISSION_GROUPS: Array<{ resource: string; label: string; permissions: Permission[] }> = [
  { resource: 'clients', label: 'Clients', permissions: ['clients.read', 'clients.write', 'clients.delete'] },
  { resource: 'assessments', label: 'Assessments', permissions: ['assessments.manage'] },
  { resource: 'programs', label: 'Programs', permissions: ['programs.read', 'programs.write'] },
  { resource: 'recipes', label: 'Recipes', permissions: ['recipes.read', 'recipes.write'] },
  { resource: 'food_library', label: 'Food library', permissions: ['food_library.view'] },
  { resource: 'plate_review', label: 'Plate review', permissions: ['plate_review.use'] },
  { resource: 'messaging', label: 'Messaging', permissions: ['messaging.use'] },
  { resource: 'collaborate', label: 'Team chat', permissions: ['collaborate.use'] },
  { resource: 'appointments', label: 'Appointments', permissions: ['appointments.manage'] },
  { resource: 'ai', label: 'AI services', permissions: ['ai.use'] },
  { resource: 'ai_ecosystem', label: 'AI Ecosystem', permissions: ['ai_ecosystem.view'] },
  { resource: 'analytics', label: 'Analytics', permissions: ['analytics.view', 'reports.view'] },
  { resource: 'automation', label: 'Automation', permissions: ['automation.manage'] },
  { resource: 'community', label: 'Community', permissions: ['community.use'] },
  { resource: 'announcements', label: 'Announcements', permissions: ['announcements.manage'] },
  { resource: 'billing', label: 'Billing', permissions: ['billing.manage'] },
  { resource: 'team', label: 'Team', permissions: ['team.manage'] },
  { resource: 'settings', label: 'Settings', permissions: ['settings.manage'] },
  { resource: 'audit', label: 'Audit', permissions: ['audit.view'] },
];

const ALL: Permission[] = [...PERMISSIONS];

/**
 * Default permissions granted by each workspace role. Owners get everything.
 * Per-user overrides (workspace_permission_overrides) refine this.
 */
export const ROLE_PERMISSIONS: Record<WorkspaceMemberRole, Permission[]> = {
  owner: ALL,
  // Manager — supervises the nutritionist team. Holds everything EXCEPT billing
  // (payments stay owner-only). Plan-gated features (recipes, AI assistant, …)
  // are further restricted by the entitlement layer regardless of this grant.
  manager: ALL.filter((p) => p !== 'billing.manage'),
  nutritionist: [
    'clients.read', 'clients.write',
    'programs.read', 'programs.write',
    'recipes.read', 'recipes.write',
    'messaging.use', 'appointments.manage', 'ai.use',
    'analytics.view', 'reports.view',
    'assessments.manage', 'food_library.view', 'plate_review.use',
    'ai_ecosystem.view', 'collaborate.use', 'community.use', 'announcements.manage',
  ],
  assistant_nutritionist: [
    'clients.read',
    'programs.read',
    'recipes.read', 'recipes.write',
    'messaging.use', 'appointments.manage', 'ai.use',
    'assessments.manage', 'food_library.view', 'plate_review.use',
    'ai_ecosystem.view', 'collaborate.use', 'community.use', 'announcements.manage',
  ],
  receptionist: [
    'clients.read', 'appointments.manage', 'messaging.use',
    'assessments.manage', 'food_library.view', 'plate_review.use',
    'collaborate.use', 'community.use', 'announcements.manage',
  ],
  coach: [
    'clients.read', 'programs.read', 'messaging.use', 'ai.use', 'analytics.view',
    'assessments.manage', 'food_library.view', 'plate_review.use',
    'ai_ecosystem.view', 'collaborate.use', 'community.use', 'announcements.manage',
  ],
  support: [
    'clients.read', 'messaging.use',
    'assessments.manage', 'food_library.view', 'plate_review.use',
    'collaborate.use', 'community.use', 'announcements.manage',
  ],
};

export type OverrideEffect = 'grant' | 'deny';
export interface PermissionOverride {
  permission: string;
  effect: OverrideEffect;
}

/**
 * Effective permission set: role defaults, then apply per-user overrides
 * (grant adds, deny removes). Unknown permission strings in overrides are
 * ignored so a stale grant can never widen access beyond the catalog.
 */
export function computeEffectivePermissions(
  role: WorkspaceMemberRole | null,
  overrides: PermissionOverride[] = [],
): Permission[] {
  const set = new Set<Permission>(role ? ROLE_PERMISSIONS[role] : []);
  for (const o of overrides) {
    if (!(PERMISSIONS as readonly string[]).includes(o.permission)) continue;
    const perm = o.permission as Permission;
    if (o.effect === 'grant') set.add(perm);
    else set.delete(perm);
  }
  return [...set].sort();
}
