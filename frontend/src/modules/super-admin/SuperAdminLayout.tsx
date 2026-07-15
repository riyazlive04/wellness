import { Link, NavLink, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Bot,
  Building2,
  CreditCard,
  Database,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Plug,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';

import { BrandMark } from '@/design-system';
import { useAuth } from '@/contexts/AuthContext';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';
import { FloatingAssistant } from '@/modules/assistant/FloatingAssistant';
import { NotificationsBell } from '@/modules/notifications/NotificationsBell';
import { PushToggle } from '@/modules/notifications/PushToggle';
import { adminNotifications } from '@/modules/notifications/notificationsApi';
import { adminPushApi } from '@/modules/super-admin/api/adminPush';

type NavItem = {
  to: string;
  end?: boolean;
  icon: typeof LayoutDashboard;
  label: string;
  /** True if the route is just a placeholder waiting for vendor decisions. */
  pending?: boolean;
};

type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: 'Insights',
    items: [
      { to: '/admin',           end: true,  icon: LayoutDashboard, label: 'Overview' },
      { to: '/admin/assistant',               icon: Bot,           label: 'Super Admin Assistant' },
      { to: '/admin/revenue',                 icon: TrendingUp,    label: 'Revenue' },
      { to: '/admin/ai-usage',                icon: Sparkles,      label: 'AI usage' },
    ],
  },
  {
    title: 'Workspaces & Users',
    items: [
      { to: '/admin/workspaces',              icon: Building2,     label: 'Workspaces' },
      { to: '/admin/users',                   icon: Users,         label: 'Users' },
      { to: '/admin/subscriptions',           icon: CreditCard,    label: 'Subscriptions' },
      { to: '/admin/billing',                 icon: Wallet,        label: 'Billing' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin/announcements',           icon: Megaphone,     label: 'Announcements' },
      { to: '/admin/audit',                   icon: ScrollText,    label: 'Audit log' },
      { to: '/admin/health',                  icon: Database,      label: 'Platform health' },
      { to: '/admin/integrations',            icon: Plug,          label: 'Integrations' },
      { to: '/admin/compliance',              icon: AlertTriangle, label: 'Compliance' },
      { to: '/admin/verifications',           icon: ShieldCheck,   label: 'Verifications' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { to: '/admin/config',                  icon: Settings,      label: 'Platform config' },
      { to: '/admin/privacy',                 icon: Shield,        label: 'Privacy policy' },
      { to: '/admin/team',                    icon: UsersRound,    label: 'Sirah team' },
    ],
  },
];

export function SuperAdminLayout() {
  const { data: scope } = useScope();
  const { confirmSignOut } = useAuth();

  return (
    <div className="relative flex h-screen overflow-hidden bg-canvas text-foreground">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 flex-shrink-0 flex-col border-r border-foreground/[0.06] bg-canvas md:flex">
        <Link to="/admin" className="flex items-center gap-3 px-5 py-5">
          <BrandMark size={28} />
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight">SIRAH LIFE PLATFORM</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
              Super Admin
            </span>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pt-2 pb-4">
          {NAV.map((group) => (
            <div key={group.title}>
              <div className="mb-1 px-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                {group.title}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                        isActive
                          ? 'text-foreground'
                          : 'text-foreground/75 dark:text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground/90',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          // Premium connected highlight — glides between sections
                          // and replays a pulse + connector thread on each switch.
                          <motion.span
                            layoutId="admin-nav-active"
                            className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-600/[0.16] to-cyan-500/[0.10] shadow-[0_6px_16px_-10px_rgba(14,154,168,0.65)] ring-1 ring-foreground/[0.06]"
                            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                          >
                            <motion.span
                              initial={{ opacity: 0.55, scale: 0.92 }}
                              animate={{ opacity: 0, scale: 1.08 }}
                              transition={{ duration: 0.5, ease: 'easeOut' }}
                              className="absolute inset-0 rounded-lg ring-2 ring-teal-500/40"
                            />
                            <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]" />
                            <motion.span
                              initial={{ width: 0, opacity: 0 }}
                              animate={{ width: 12, opacity: 1 }}
                              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                              className="absolute left-full top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-cyan-500/70 to-transparent"
                            />
                          </motion.span>
                        )}
                        <span className="relative z-[1] flex items-center gap-2.5">
                          <motion.span
                            key={isActive ? 'on' : 'off'}
                            initial={isActive ? { scale: 0.6 } : false}
                            animate={{ scale: isActive ? 1.1 : 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                            className="flex"
                          >
                            <item.icon className={cn('h-4 w-4', isActive && 'text-teal-600 dark:text-teal-300')} />
                          </motion.span>
                          {item.label}
                        </span>
                        {item.pending && (
                          <span className="relative z-[1] rounded-full border border-amber-300/40 bg-amber-300/10 px-1.5 py-0 text-[9px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
                            Soon
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-foreground/[0.06] px-3 py-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.40)] to-[hsl(var(--brand-magenta)_/_0.30)] text-[10px] font-medium text-white">
              <ShieldCheck className="h-3 w-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{scope?.email ?? 'Super Admin'}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Platform owner</div>
            </div>
            <button
              type="button"
              onClick={confirmSignOut}
              className="grid h-7 w-7 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex h-screen min-w-0 flex-1 flex-col md:pl-64">
        <header className="z-20 border-b border-foreground/[0.06] bg-canvas/85 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/40 bg-teal-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              <Sparkles className="h-3 w-3" />
              Platform admin
            </span>
            <span className="hidden text-xs text-foreground/75 dark:text-foreground/55 sm:inline">All workspaces · all users</span>
            <div className="ml-auto flex items-center gap-2">
              <PushToggle adapter={adminPushApi} hint="Get browser alerts for signups, verifications and payment issues" />
              <NotificationsBell surface={adminNotifications} />
            </div>
          </div>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      {/* Always-available role-scoped AI chat (Executive AI for super admin). */}
      <FloatingAssistant />
    </div>
  );
}
