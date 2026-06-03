import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CreditCard,
  Database,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';

import { BrandMark } from '@/design-system';
import { supabase } from '@/integrations/supabase/client';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';

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
      { to: '/admin/revenue',                 icon: TrendingUp,    label: 'Revenue',    pending: true },
      { to: '/admin/ai-usage',                icon: Sparkles,      label: 'AI usage',   pending: true },
    ],
  },
  {
    title: 'Workspaces & Users',
    items: [
      { to: '/admin/workspaces',              icon: Building2,     label: 'Workspaces' },
      { to: '/admin/users',                   icon: Users,         label: 'Users' },
      { to: '/admin/subscriptions',           icon: CreditCard,    label: 'Subscriptions', pending: true },
      { to: '/admin/billing',                 icon: Wallet,        label: 'Billing',       pending: true },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin/announcements',           icon: Megaphone,     label: 'Announcements' },
      { to: '/admin/audit',                   icon: ScrollText,    label: 'Audit log' },
      { to: '/admin/health',                  icon: Database,      label: 'Platform health', pending: true },
      { to: '/admin/integrations',            icon: Plug,          label: 'Integrations',    pending: true },
      { to: '/admin/compliance',              icon: AlertTriangle, label: 'Compliance',      pending: true },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { to: '/admin/config',                  icon: Settings,      label: 'Platform config' },
      { to: '/admin/team',                    icon: UsersRound,    label: 'Sirah team' },
    ],
  },
];

export function SuperAdminLayout() {
  const navigate = useNavigate();
  const { data: scope } = useScope();

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/auth');
  }

  return (
    <div className="relative flex min-h-screen bg-canvas text-foreground">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 flex-shrink-0 flex-col border-r border-foreground/[0.06] bg-canvas md:flex">
        <Link to="/admin" className="flex items-center gap-3 px-5 py-5">
          <BrandMark size={28} />
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight">SIRAH PLATFORM</span>
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
                        'flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                        isActive
                          ? 'bg-foreground/[0.06] text-foreground'
                          : 'text-foreground/75 dark:text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground/90',
                      )
                    }
                  >
                    <span className="flex items-center gap-2.5">
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    {item.pending && (
                      <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-1.5 py-0 text-[9px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
                        Soon
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-foreground/[0.06] px-3 py-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-[10px] font-medium text-white">
              <ShieldCheck className="h-3 w-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{scope?.email ?? 'Super Admin'}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Platform owner</div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="grid h-7 w-7 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-20 border-b border-foreground/[0.06] bg-canvas/85 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
              <Sparkles className="h-3 w-3" />
              Platform admin
            </span>
            <span className="text-xs text-foreground/75 dark:text-foreground/55">All workspaces · all users</span>
          </div>
        </header>

        <main className="relative flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
