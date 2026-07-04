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
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Grouping for the admin UI — resource → its actions. */
export const PERMISSION_GROUPS: Array<{ resource: string; label: string; permissions: Permission[] }> = [
  { resource: 'clients', label: 'Clients', permissions: ['clients.read', 'clients.write', 'clients.delete'] },
  { resource: 'programs', label: 'Programs', permissions: ['programs.read', 'programs.write'] },
  { resource: 'recipes', label: 'Recipes', permissions: ['recipes.read', 'recipes.write'] },
  { resource: 'messaging', label: 'Messaging', permissions: ['messaging.use'] },
  { resource: 'appointments', label: 'Appointments', permissions: ['appointments.manage'] },
  { resource: 'ai', label: 'AI services', permissions: ['ai.use'] },
  { resource: 'analytics', label: 'Analytics', permissions: ['analytics.view', 'reports.view'] },
  { resource: 'automation', label: 'Automation', permissions: ['automation.manage'] },
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
  ],
  assistant_nutritionist: [
    'clients.read',
    'programs.read',
    'recipes.read', 'recipes.write',
    'messaging.use', 'appointments.manage', 'ai.use',
  ],
  receptionist: [
    'clients.read', 'appointments.manage', 'messaging.use',
  ],
  coach: [
    'clients.read', 'programs.read', 'messaging.use', 'ai.use', 'analytics.view',
  ],
  support: [
    'clients.read', 'messaging.use',
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
