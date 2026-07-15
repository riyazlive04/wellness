import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react';

import { BrandMark, Glass, Wordmark } from '@/design-system';
import { useAuth } from '@/contexts/AuthContext';
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
  const { confirmSignOut } = useAuth();
  const { data: scope } = useScope();
  const isOwner = scope?.workspaceRole === 'owner' || !!scope?.isSuperAdmin;
  const nav = visibleOwnerNav(isOwner, scope, scope?.permissions);
  // Sign-out opens a confirmation dialog (handled globally in AuthProvider).
  const handleSignOut = onSignOut ?? confirmSignOut;
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

  // Keep the active nav item in view. On shorter viewports the ACCOUNT group
  // (Billing / Subscription / Team) sits below the trial card + profile, so
  // without this the section you're on can be hidden under the scroll fold.
  const activeItemRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    const el = activeItemRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(id);
  }, [pathname]);

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
              <Wordmark className="text-sm" />
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
                      ref={active ? activeItemRef : undefined}
                      className={cn(
                        'group relative flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                        active
                          ? 'text-foreground'
                          : 'text-foreground dark:text-foreground/80 hover:bg-foreground/[0.04]',
                        collapsed && 'justify-center px-0',
                      )}
                    >
                      {active && (
                        // Premium connected highlight: an elevated pill that
                        // glides between sections (shared layoutId). On each
                        // switch the new pill mounts fresh, so its children
                        // replay: a landing pulse + a connector thread that
                        // re-draws toward the page.
                        <motion.span
                          layoutId="owner-nav-active"
                          className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-600/[0.16] to-cyan-500/[0.10] shadow-[0_6px_16px_-10px_rgba(14,154,168,0.65)] ring-1 ring-foreground/[0.06]"
                          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                        >
                          {/* landing pulse — radiates once when a section lands */}
                          <motion.span
                            initial={{ opacity: 0.55, scale: 0.92 }}
                            animate={{ opacity: 0, scale: 1.08 }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                            className="absolute inset-0 rounded-lg ring-2 ring-teal-500/40"
                          />
                          {/* left accent bar */}
                          <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]" />
                          {/* connector thread — re-draws toward the page */}
                          {!collapsed && (
                            <motion.span
                              initial={{ width: 0, opacity: 0 }}
                              animate={{ width: 12, opacity: 1 }}
                              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                              className="absolute left-full top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-cyan-500/70 to-transparent"
                            />
                          )}
                        </motion.span>
                      )}
                      <span className="relative z-[1] flex items-center gap-2.5">
                        {/* icon pops each time this item becomes active */}
                        <motion.span
                          key={active ? 'on' : 'off'}
                          initial={active ? { scale: 0.6 } : false}
                          animate={{ scale: active ? 1.1 : 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                          className="flex"
                        >
                          <Icon
                            className={cn(
                              'h-4 w-4 flex-shrink-0 transition-colors',
                              active && 'text-teal-600 dark:text-teal-300',
                            )}
                          />
                        </motion.span>
                        {!collapsed && item.label}
                      </span>
                      {!collapsed && item.soon && (
                        <span className="relative z-[1] rounded-full border border-amber-300/40 bg-amber-300/10 px-1.5 py-0 text-[9px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
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
                className="h-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]"
                style={{ width: `${Math.min(100, (trialDaysLeft / 30) * 100)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => navigate('/subscription')}
              className="mt-3 w-full rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:from-teal-500/40 hover:to-emerald-400/30"
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
