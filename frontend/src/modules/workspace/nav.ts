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
  FileText,
  Settings,
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
    items: [
      { to: '/sirah/dashboard',      label: 'Overview',        icon: LayoutDashboard },
      { to: '/sirah/clients',        label: 'Clients',         icon: Users },
      { to: '/sirah/programs',       label: 'Programs',        icon: ClipboardList },
      { to: '/sirah/ai',             label: 'AI Assistant',    icon: Sparkles,      soon: true },
    ],
  },
  {
    label: 'Engagement',
    items: [
      { to: '/sirah/messaging',      label: 'Messaging',       icon: MessageCircle },
      { to: '/sirah/appointments',   label: 'Appointments',    icon: Calendar },
      { to: '/sirah/automation',     label: 'Automation',      icon: Zap,           soon: true },
      { to: '/sirah/analytics',      label: 'Analytics',       icon: BarChart3 },
      { to: '/sirah/community',      label: 'Community',       icon: Globe2 },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/sirah/billing',        label: 'Billing',         icon: CreditCard },
      { to: '/sirah/subscription',   label: 'Subscription',    icon: Receipt },
      { to: '/sirah/team',           label: 'Team',            icon: UserCog },
      { to: '/sirah/notifications',  label: 'Notifications',   icon: Bell,          soon: true },
      { to: '/sirah/reports',        label: 'Reports',         icon: FileText,      soon: true },
      { to: '/sirah/settings',       label: 'Settings',        icon: Settings,      soon: true },
    ],
  },
];
