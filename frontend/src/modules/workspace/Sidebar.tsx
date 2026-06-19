import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react';
import { toast } from 'sonner';

import { BrandMark, Glass } from '@/design-system';
import { supabase } from '@/integrations/supabase/client';
import { useOwnerIdentity } from '@/hooks/useOwnerIdentity';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';
import { visibleOwnerNav } from './nav';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { WorkspaceProfileButton } from './WorkspaceProfileButton';

interface SidebarProps {
  /** Workspace identity for the footer block */
  practiceName: string;
  ownerName: string;
  initials: string;
  /** Days remaining in trial — null hides the trial card */
  trialDaysLeft?: number | null;
  /**
   * Optional override for sign-out. Defaults to a real Supabase sign-out +
   * redirect to /auth — pages don't need to wire this themselves.
   */
  onSignOut?: () => void;
}

export function Sidebar({
  practiceName,
  ownerName,
  initials,
  trialDaysLeft = 28,
  onSignOut,
}: SidebarProps) {
  const navigate = useNavigate();
  // Real signed-in user's name for the footer block (prop is a fallback only).
  const { ownerName: resolvedOwnerName } = useOwnerIdentity();
  const { data: scope } = useScope();
  const isOwner = scope?.workspaceRole === 'owner' || !!scope?.isSuperAdmin;
  const nav = visibleOwnerNav(isOwner);
  const handleSignOut = onSignOut ?? (async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[sidebar] sign-out failed', err);
      toast.error('Could not sign out — try again.');
      return;
    }
    // Clear cached app-level state. AuthProvider's onAuthStateChange handler
    // also navigates to /auth, but doing it here is faster + survives if the
    // legacy AuthProvider gets removed later.
    try { localStorage.removeItem('app-user-role'); } catch { /* ignore */ }
    navigate('/auth');
  });
  const [collapsed, setCollapsed] = useState(false);

  // Expose the sidebar's current width as a CSS variable so the OwnerLayout
  // can pad the main content area without us hoisting collapse state up.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty(
      '--sidebar-width',
      collapsed ? '72px' : '260px',
    );
  }, [collapsed]);
  const { pathname } = useLocation();

  return (
    <aside
      className={cn(
        // fixed (not sticky) so parent overflow-hidden can't break it and the
        // sidebar stays put regardless of how the main content scrolls
        'fixed left-0 top-0 z-30 hidden h-screen flex-shrink-0 flex-col border-r border-foreground/[0.06] bg-canvas md:flex',
        collapsed ? 'w-[72px]' : 'w-[260px]',
        'transition-[width] duration-200 ease-out',
      )}
    >
      {/* Brand */}
      <div className="flex h-16 items-center justify-between border-b border-foreground/[0.06] px-4">
        <Link to="/dashboard" className="flex items-center gap-3 overflow-hidden">
          <BrandMark size={28} animated={false} />
          {!collapsed && (
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight">SIRAH LIFE</span>
              <span className="truncate text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                {practiceName}
              </span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="grid h-7 w-7 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Workspace switcher — only renders for multi-workspace users */}
      {!collapsed && <WorkspaceSwitcher />}

      {/* Nav — styled to match SuperAdminLayout for visual consistency.
          Group spacing uses flex-gap rather than mt-6 so the rhythm matches
          admin exactly. Item density: rounded-lg px-3 py-1.5, icon-label
          gap 2.5 — identical to admin. */}
      <nav className="scrollbar-hide flex flex-1 flex-col gap-4 overflow-y-auto px-3 pt-4 pb-4">
        {nav.map((group, gi) => (
          <div key={gi}>
            {!collapsed && group.label && (
              <div className="mb-1 px-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                {group.label}
              </div>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active =
                  item.to === '/dashboard'
                    ? pathname === item.to
                    : pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={cn(
                        'group relative flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-foreground/[0.06] text-foreground'
                          : 'text-foreground/75 dark:text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground/90',
                        collapsed && 'justify-center px-0',
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="owner-nav-active"
                          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-blue-600 to-fuchsia-500"
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        />
                      )}
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        {!collapsed && item.label}
                      </span>
                      {!collapsed && item.soon && (
                        <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-1.5 py-0 text-[9px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
                          soon
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Trial card */}
      {!collapsed && trialDaysLeft !== null && trialDaysLeft !== undefined && trialDaysLeft > 0 && (
        <div className="px-3 pb-3">
          <Glass className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Trial</span>
              <span className="text-[10px] text-foreground/75 dark:text-foreground/55">{trialDaysLeft}d left</span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.04]">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-fuchsia-500"
                style={{ width: `${Math.min(100, (trialDaysLeft / 30) * 100)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => navigate('/subscription')}
              className="mt-3 w-full rounded-lg bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:from-violet-500/40 hover:to-emerald-400/30"
            >
              Upgrade now
            </button>
          </Glass>
        </div>
      )}

      {/* User block */}
      <div className={cn('border-t border-foreground/[0.06] p-3', collapsed && 'flex justify-center')}>
        {collapsed ? (
          <WorkspaceProfileButton initials={initials} className="h-8 w-8" />
        ) : (
          <div className="flex items-center gap-3">
            <WorkspaceProfileButton initials={initials} className="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{resolvedOwnerName || ownerName}</div>
              <div className="truncate text-[11px] text-foreground/75 dark:text-foreground/55">Workspace owner</div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="grid h-7 w-7 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
