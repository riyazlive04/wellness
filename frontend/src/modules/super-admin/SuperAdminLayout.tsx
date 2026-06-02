import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Building2,
  CreditCard,
  Database,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { BrandMark } from '@/design-system';
import { supabase } from '@/integrations/supabase/client';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';

/**
 * Distinct shell for the Sirah Digital internal team. Visually different
 * from the workspace OwnerLayout (subtler chrome, no trial card, no
 * upgrade CTA) so it's obvious you're in platform-admin mode.
 */
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
      <aside className="sticky top-0 hidden h-screen w-64 flex-shrink-0 flex-col border-r border-foreground/[0.06] bg-canvas md:flex">
        {/* Brand */}
        <Link to="/admin" className="flex items-center gap-3 px-5 py-5">
          <BrandMark size={28} />
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight">SIRAH PLATFORM</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
              Super Admin
            </span>
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-foreground/[0.06] text-foreground'
                    : 'text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground/90',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-foreground/[0.06] px-3 py-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-[10px] font-medium text-white">
              <ShieldCheck className="h-3 w-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{scope?.email ?? 'Super Admin'}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Platform owner</div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="grid h-7 w-7 place-items-center rounded-lg text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Topbar + content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-foreground/[0.06] bg-canvas/85 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-violet-300">
              <Sparkles className="h-3 w-3" />
              Platform admin
            </span>
            <span className="text-xs text-foreground/55">All workspaces · all users</span>
          </div>
        </header>

        <main className="relative flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const NAV = [
  { to: '/admin',                end: true,  icon: LayoutDashboard, label: 'Overview' },
  { to: '/admin/workspaces',     end: false, icon: Building2,       label: 'Workspaces' },
  { to: '/admin/subscriptions',  end: false, icon: CreditCard,      label: 'Subscriptions' },
  { to: '/admin/ai-usage',       end: false, icon: Sparkles,        label: 'AI usage' },
  { to: '/admin/audit',          end: false, icon: ScrollText,      label: 'Audit log' },
  { to: '/admin/health',         end: false, icon: Database,        label: 'Platform health' },
  { to: '/admin/settings',       end: false, icon: Settings,        label: 'Settings' },
] as const;
