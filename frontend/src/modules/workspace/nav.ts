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
      { to: '/billing',        label: 'Billing',         icon: CreditCard },
      { to: '/subscription',   label: 'Subscription',    icon: Receipt },
      { to: '/team',           label: 'Team',            icon: UserCog },
      { to: '/notifications',  label: 'Notifications',   icon: Bell },
      { to: '/announcements',  label: 'Announcements',   icon: Megaphone },
      { to: '/reports',        label: 'Reports',         icon: FileText },
      { to: '/dashboard/activity', label: 'Activity',    icon: Activity },
      { to: '/organizations',  label: 'Organizations',   icon: Building2 },
      { to: '/settings',       label: 'Settings',        icon: Settings },
    ],
  },
];
