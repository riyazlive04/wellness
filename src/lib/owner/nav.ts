/**
 * Nutritionist (workspace owner) navigation for the mobile shell.
 *
 * Ported from the web sidebar map (frontend/src/modules/workspace/nav.ts) —
 * SAME destinations, SAME plan-feature gating and SAME permission gating, so a
 * manager on Growth sees exactly the surfaces on their phone that they see on
 * the web. Only the presentation differs: five destinations are promoted to a
 * bottom tab bar and the rest live under More.
 *
 * Keep this file in sync with the web nav.ts — they are two views of one map.
 */
import type { Ionicons } from '@expo/vector-icons';

import type { Feature } from '@/lib/plan-capabilities';
import { featuresOf } from '@/lib/plan-capabilities';

export type IoniconName = keyof typeof Ionicons.glyphMap;

/** Which live attention-count feeds a nav item's badge (see ownerApi.sidebarBadges). */
export type BadgeKey = 'messaging' | 'clients' | 'appointments' | 'notifications';

export interface NavItem {
  /** expo-router href. */
  to: string;
  label: string;
  icon: IoniconName;
  /** Shows a live count pill fed by the matching sidebar-badges field. */
  badge?: BadgeKey;
  /** Visible only to the workspace owner (and super admins). */
  ownerOnly?: boolean;
  /**
   * If set, a non-owner may still see this item when their effective
   * permissions include it — so the owner can delegate an owner-only area
   * (e.g. Billing, Team) to a manager via the permission toggles.
   */
  permission?: string;
  /** Plan-gated: hidden unless the workspace plan includes this feature. */
  feature?: Feature;
  /** One-line hint shown under the label in the More list. */
  hint?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const OWNER_NAV: NavGroup[] = [
  {
    items: [{ to: '/(owner)/overview', label: 'Overview', icon: 'grid-outline', hint: 'Practice at a glance' }],
  },
  {
    label: 'Clients',
    items: [
      { to: '/(owner)/clients', label: 'Clients', icon: 'people-outline', permission: 'clients.read', badge: 'clients', hint: 'Roster, progress and notes' },
      { to: '/(owner)/more/programs', label: 'Programs', icon: 'clipboard-outline', permission: 'programs.read', hint: 'Templates and assignments' },
      { to: '/(owner)/more/assessments', label: 'Assessments', icon: 'checkbox-outline', permission: 'assessments.manage', hint: 'Forms and responses' },
      { to: '/(owner)/appointments', label: 'Appointments', icon: 'calendar-outline', feature: 'appointments', permission: 'appointments.manage', badge: 'appointments', hint: 'Schedule and video calls' },
      { to: '/(owner)/messaging', label: 'Messaging', icon: 'chatbubble-ellipses-outline', permission: 'messaging.use', badge: 'messaging', hint: 'Client conversations' },
    ],
  },
  {
    // One "Nutrition" entry; its sub-sections (Food library · Recipes · Plate
    // review · Products) switch via the tab bar on the page itself — mirroring
    // the web's one-item-with-tabs pattern. Gated on food_library.view (the
    // default tab); recipes stays plan-gated at its own tab.
    items: [
      { to: '/(owner)/more/nutrition', label: 'Nutrition', icon: 'restaurant-outline', permission: 'food_library.view', hint: 'Foods, recipes, plate review, products' },
    ],
  },
  {
    items: [
      { to: '/(owner)/more/ai', label: 'AI Assistant', icon: 'sparkles-outline', feature: 'ai_assistant', permission: 'ai.use', hint: 'Clinical assistant and brief' },
    ],
  },
  {
    label: 'Grow',
    items: [
      { to: '/(owner)/more/analytics', label: 'Analytics', icon: 'bar-chart-outline', feature: 'analytics', permission: 'analytics.view', hint: 'Growth, engagement, outcomes' },
      { to: '/(owner)/more/community', label: 'Community', icon: 'globe-outline', feature: 'community', permission: 'community.use', hint: 'Posts and cohorts' },
      { to: '/(owner)/more/automation', label: 'Automation', icon: 'flash-outline', ownerOnly: true, feature: 'automation', hint: 'Rules that react to events' },
      { to: '/(owner)/more/settings?tab=public', label: 'Public page', icon: 'link-outline', permission: 'settings.manage', hint: 'Your public profile link' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/(owner)/more/collaborate', label: 'Team chat', icon: 'chatbubbles-outline', permission: 'collaborate.use', hint: 'Channels and shared notes' },
      { to: '/(owner)/more/team', label: 'Team', icon: 'people-circle-outline', ownerOnly: true, permission: 'team.manage', hint: 'Staff, invites, permissions' },
      { to: '/(owner)/more/billing', label: 'Billing', icon: 'card-outline', ownerOnly: true, permission: 'billing.manage', hint: 'Plan, invoices, payments' },
      { to: '/(owner)/more/organizations', label: 'Organizations', icon: 'business-outline', ownerOnly: true, feature: 'organizations', hint: 'Corporate accounts' },
      { to: '/(owner)/more/reports', label: 'Reports', icon: 'document-text-outline', permission: 'reports.view', hint: 'Generate and schedule PDFs' },
      { to: '/(owner)/more/notifications', label: 'Notifications', icon: 'notifications-outline', badge: 'notifications', hint: 'Alerts and activity' },
      { to: '/(owner)/more/activity', label: 'Activity', icon: 'pulse-outline', feature: 'audit_logs', permission: 'audit.view', hint: 'Audit trail' },
      { to: '/(owner)/more/settings', label: 'Settings', icon: 'settings-outline', permission: 'settings.manage', hint: 'Workspace, branding, account' },
    ],
  },
];

/**
 * Destinations promoted to the bottom tab bar. Everything else reaches the user
 * through More. Kept deliberately short — a phone tab bar past five items stops
 * being tappable.
 */
export const OWNER_TAB_ROUTES = ['/(owner)/overview', '/(owner)/clients', '/(owner)/messaging', '/(owner)/appointments'] as const;

function navItemAllowed(i: NavItem, isOwner: boolean, unlocked: Feature[], permissions: string[]): boolean {
  // Plan gate first — a feature not in the plan is never shown.
  if (i.feature && !unlocked.includes(i.feature)) return false;
  // Owners (and super admins) hold every permission.
  if (isOwner) return true;
  // Owner-only items appear for a non-owner only if the delegating permission
  // was granted.
  if (i.ownerOnly) return !!i.permission && permissions.includes(i.permission);
  // Regular items: if they declare a permission, the member must hold it
  // (so a Deny hides the item); otherwise they're always visible.
  if (i.permission) return permissions.includes(i.permission);
  return true;
}

/**
 * Nav filtered by plan + permissions.
 *
 * Takes the whole scope so entitlements come from the server-resolved
 * `features[]` rather than being re-derived from the plan key — see
 * plan-capabilities.ts for why that distinction cost the web app its AI
 * Assistant on Growth. Passing null (signed out / still resolving) yields the
 * trial set.
 */
export function visibleOwnerNav(
  isOwner: boolean,
  scope?: { features?: string[]; plan?: string | null; isSuperAdmin?: boolean } | null,
  permissions: string[] = [],
): NavGroup[] {
  const unlocked = featuresOf(scope);
  return OWNER_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => navItemAllowed(i, isOwner, unlocked, permissions)),
  })).filter((g) => g.items.length > 0);
}

/** Flat list of every allowed item — used to gate a route and to build More. */
export function allowedOwnerItems(
  isOwner: boolean,
  scope?: { features?: string[]; plan?: string | null; isSuperAdmin?: boolean } | null,
  permissions: string[] = [],
): NavItem[] {
  return visibleOwnerNav(isOwner, scope, permissions).flatMap((g) => g.items);
}

/**
 * The permission required to open `path`, derived from the nav map — used to
 * gate owner routes centrally. Matches the most specific nav item that prefixes
 * the path. Returns undefined for ungated paths.
 */
export function permissionForPath(path: string): string | undefined {
  let best: NavItem | undefined;
  for (const group of OWNER_NAV) {
    for (const item of group.items) {
      if (!item.permission) continue;
      const to = item.to.split('?')[0];
      if (path === to || path.startsWith(to + '/')) {
        if (!best || to.length > best.to.split('?')[0].length) best = item;
      }
    }
  }
  return best?.permission;
}

/** The plan feature required to open `path`, or undefined when ungated. */
export function featureForPath(path: string): Feature | undefined {
  let best: NavItem | undefined;
  for (const group of OWNER_NAV) {
    for (const item of group.items) {
      if (!item.feature) continue;
      const to = item.to.split('?')[0];
      if (path === to || path.startsWith(to + '/')) {
        if (!best || to.length > best.to.split('?')[0].length) best = item;
      }
    }
  }
  return best?.feature;
}
