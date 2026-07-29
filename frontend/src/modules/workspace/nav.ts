import {
  LayoutDashboard,
  Users,
  ClipboardList,
  ClipboardCheck,
  Sparkles,
  MessageCircle,
  Calendar,
  BarChart3,
  Globe2,
  CreditCard,
  UserCog,
  Bell,
  FileText,
  Settings,
  ChefHat,
  Activity,
  Building2,
  MessagesSquare,
  Link2,
  type LucideIcon,
} from 'lucide-react';
import { featuresOf, type Feature } from '@/lib/planCapabilities';

/** Which live attention-count feeds a nav item's badge (see clientsApi.sidebarBadges). */
export type BadgeKey = 'messaging' | 'clients' | 'appointments' | 'notifications';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shows a live count pill fed by the matching sidebar-badges field. */
  badge?: BadgeKey;
  /** True if the destination isn't built yet — shows a soft "soon" hint */
  soon?: boolean;
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
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * Owner sidebar navigation, grouped by the job a nutritionist is doing:
 *   Overview (home) · Clients · Nutrition · AI · Grow · Account
 * Related surfaces live together (e.g. Food library + Recipes + Plate review
 * under Nutrition), so the menu maps to how a practice actually works rather
 * than to internal module boundaries.
 */
export const OWNER_NAV: NavGroup[] = [
  // Home — no header, pinned at the very top.
  {
    items: [
      { to: '/dashboard',      label: 'Overview',        icon: LayoutDashboard },
    ],
  },
  {
    label: 'Clients',
    items: [
      { to: '/clients',        label: 'Clients',         icon: Users,          permission: 'clients.read', badge: 'clients' },
      { to: '/programs',       label: 'Programs',        icon: ClipboardList,  permission: 'programs.read' },
      { to: '/assessments',    label: 'Assessments',     icon: ClipboardCheck, permission: 'assessments.manage' },
      { to: '/appointments',   label: 'Appointments',    icon: Calendar, feature: 'appointments', permission: 'appointments.manage', badge: 'appointments' },
      { to: '/messaging',      label: 'Messaging',       icon: MessageCircle,  permission: 'messaging.use', badge: 'messaging' },
    ],
  },
  {
    // One "Nutrition" entry; its sub-sections (Food library · Recipes · Plate
    // review · Products) switch via the NutritionTabs bar on each page — the
    // same one-item-with-tabs pattern as Billing. Headerless so it reads as a
    // single top-level item, like Overview. Gated on food_library.view (the
    // default tab); recipes stays plan-gated at its own route + tab.
    items: [
      { to: '/dashboard/nutrition/foods', label: 'Nutrition', icon: ChefHat, permission: 'food_library.view' },
    ],
  },
  {
    // Single AI item (headerless, like Overview/Nutrition). AI Ecosystem removed.
    items: [
      { to: '/ai',             label: 'AI Assistant',    icon: Sparkles, feature: 'ai_assistant', permission: 'ai.use' },
    ],
  },
  {
    label: 'Grow',
    items: [
      { to: '/analytics',      label: 'Analytics',       icon: BarChart3, feature: 'analytics', permission: 'analytics.view' },
      { to: '/community',      label: 'Community',       icon: Globe2, feature: 'community', permission: 'community.use' },
      { to: '/settings?tab=public', label: 'Public page', icon: Link2, permission: 'settings.manage' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/collaborate',    label: 'Team chat',       icon: MessagesSquare, permission: 'collaborate.use' },
      { to: '/team',           label: 'Team',            icon: UserCog,    ownerOnly: true, permission: 'team.manage' },
      { to: '/billing',        label: 'Billing',         icon: CreditCard, ownerOnly: true, permission: 'billing.manage' },
      { to: '/organizations',  label: 'Organizations',   icon: Building2, ownerOnly: true, feature: 'organizations' },
      { to: '/reports',        label: 'Reports',         icon: FileText,   permission: 'reports.view' },
      { to: '/notifications',  label: 'Notifications',   icon: Bell, badge: 'notifications' },
      { to: '/dashboard/activity', label: 'Activity',    icon: Activity, feature: 'audit_logs', permission: 'audit.view' },
      { to: '/settings',       label: 'Settings',        icon: Settings,   permission: 'settings.manage' },
    ],
  },
];

/**
 * Filter the owner nav for the viewer's role AND their workspace plan.
 * - Owner-only items (billing, subscription, team, organizations) are hidden
 *   from managers/coaches.
 * - Plan-gated items (those with a `feature`) are hidden unless the plan
 *   includes that feature. `plan` omitted → trial (Pro-level) defaults.
 * Empty groups are dropped so we don't render a stray section header.
 */
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
 * planCapabilities.ts for why that distinction cost us the AI Assistant on
 * Growth. Passing null (signed out / still resolving) yields the trial set.
 */
export function visibleOwnerNav(
  isOwner: boolean,
  scope?: { features?: string[]; plan?: string | null; isSuperAdmin?: boolean } | null,
  permissions: string[] = [],
): NavGroup[] {
  const unlocked = featuresOf(scope);
  return OWNER_NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => navItemAllowed(i, isOwner, unlocked, permissions)) }))
    .filter((g) => g.items.length > 0);
}

/**
 * The permission required to open `pathname`, derived from the nav map — used
 * to gate owner routes centrally (in OwnerLayout). Matches the most specific
 * nav item that prefixes the path. Returns undefined for ungated paths.
 */
export function permissionForPath(pathname: string): string | undefined {
  let best: NavItem | undefined;
  for (const group of OWNER_NAV) {
    for (const item of group.items) {
      if (!item.permission) continue;
      if (pathname === item.to || pathname.startsWith(item.to + '/')) {
        if (!best || item.to.length > best.to.length) best = item;
      }
    }
  }
  return best?.permission;
}
