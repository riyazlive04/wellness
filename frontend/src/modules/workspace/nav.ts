import {
  LayoutDashboard,
  Users,
  ClipboardList,
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
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** True if the destination isn't built yet — shows a soft "soon" hint */
  soon?: boolean;
  /** Visible only to the workspace owner (and super admins). */
  ownerOnly?: boolean;
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
      { to: '/dashboard/nutrition/foods',   label: 'Food library', icon: BookOpen },
      { to: '/dashboard/nutrition/recipes', label: 'Recipes',      icon: ChefHat },
      { to: '/dashboard/plate-review',      label: 'Plate review', icon: Camera },
      { to: '/ai',             label: 'AI Assistant',    icon: Sparkles },
      { to: '/ai-ecosystem',   label: 'AI Ecosystem',    icon: Brain },
    ],
  },
  {
    label: 'Engagement',
    items: [
      { to: '/messaging',      label: 'Messaging',       icon: MessageCircle },
      { to: '/collaborate',    label: 'Team chat',       icon: MessagesSquare },
      { to: '/appointments',   label: 'Appointments',    icon: Calendar },
      { to: '/automation',     label: 'Automation',      icon: Zap },
      { to: '/analytics',      label: 'Analytics',       icon: BarChart3 },
      { to: '/community',      label: 'Community',       icon: Globe2 },
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
      { to: '/organizations',  label: 'Organizations',   icon: Building2, ownerOnly: true },
      { to: '/settings',       label: 'Settings',        icon: Settings },
    ],
  },
];

/**
 * Filter the owner nav for the viewer's role. Owner-only items (billing,
 * subscription, team, organizations) are hidden from managers/coaches; empty
 * groups are dropped so we don't render a stray section header.
 */
export function visibleOwnerNav(isOwner: boolean): NavGroup[] {
  if (isOwner) return OWNER_NAV;
  return OWNER_NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.ownerOnly) }))
    .filter((g) => g.items.length > 0);
}
