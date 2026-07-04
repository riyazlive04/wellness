import {
  LayoutDashboard,
  Users,
  ClipboardList,
  ClipboardCheck,
  Sparkles,
  MessageCircle,
  Calendar,
  Zap,
  BarChart3,
  Globe2,
  CreditCard,
  Receipt,
  UserCog,
  Bell,
  Megaphone,
  FileText,
  Settings,
  BookOpen,
  ChefHat,
  Activity,
  Building2,
  Camera,
  MessagesSquare,
  Brain,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { featuresForPlan, type Feature } from '@/lib/planCapabilities';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** True if the destination isn't built yet — shows a soft "soon" hint */
  soon?: boolean;
  /** Visible only to the workspace owner (and super admins). */
  ownerOnly?: boolean;
  /** Plan-gated: hidden unless the workspace plan includes this feature. */
  feature?: Feature;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * Owner sidebar navigation. Organized into three groups:
 * - Primary work surfaces (above the fold)
 * - Engagement modules
 * - Account / configuration
 */
export const OWNER_NAV: NavGroup[] = [
  {
    label: 'Insights',
    items: [
      { to: '/dashboard',      label: 'Overview',        icon: LayoutDashboard },
      { to: '/clients',        label: 'Clients',         icon: Users },
      { to: '/programs',       label: 'Programs',        icon: ClipboardList },
      { to: '/assessments',    label: 'Assessments',     icon: ClipboardCheck },
      { to: '/dashboard/nutrition/foods',   label: 'Food library', icon: BookOpen },
      { to: '/dashboard/nutrition/recipes', label: 'Recipes',      icon: ChefHat, feature: 'recipes' },
      { to: '/dashboard/plate-review',      label: 'Plate review', icon: Camera },
      { to: '/ai',             label: 'AI Assistant',    icon: Sparkles, feature: 'ai_assistant' },
      { to: '/ai-ecosystem',   label: 'AI Ecosystem',    icon: Brain },
    ],
  },
  {
    label: 'Engagement',
    items: [
      { to: '/messaging',      label: 'Messaging',       icon: MessageCircle },
      { to: '/collaborate',    label: 'Team chat',       icon: MessagesSquare },
      { to: '/appointments',   label: 'Appointments',    icon: Calendar, feature: 'appointments' },
      { to: '/automation',     label: 'Automation',      icon: Zap },
      { to: '/analytics',      label: 'Analytics',       icon: BarChart3 },
      { to: '/community',      label: 'Community',       icon: Globe2, feature: 'community' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/billing',        label: 'Billing',         icon: CreditCard, ownerOnly: true },
      { to: '/subscription',   label: 'Subscription',    icon: Receipt,    ownerOnly: true },
      { to: '/team',           label: 'Team',            icon: UserCog,    ownerOnly: true },
      { to: '/notifications',  label: 'Notifications',   icon: Bell },
      { to: '/announcements',  label: 'Announcements',   icon: Megaphone },
      { to: '/reports',        label: 'Reports',         icon: FileText },
      { to: '/dashboard/activity', label: 'Activity',    icon: Activity },
      { to: '/organizations',  label: 'Organizations',   icon: Building2, ownerOnly: true, feature: 'organizations' },
      { to: '/privacy-policy', label: 'Privacy policy',  icon: ShieldCheck, ownerOnly: true },
      { to: '/settings',       label: 'Settings',        icon: Settings },
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
export function visibleOwnerNav(isOwner: boolean, plan?: string | null): NavGroup[] {
  const unlocked = featuresForPlan(plan);
  const allowed = (i: NavItem) =>
    (isOwner || !i.ownerOnly) && (!i.feature || unlocked.includes(i.feature));
  return OWNER_NAV
    .map((g) => ({ ...g, items: g.items.filter(allowed) }))
    .filter((g) => g.items.length > 0);
}
