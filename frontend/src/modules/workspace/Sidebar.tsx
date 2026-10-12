import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { BrandMark, Wordmark } from '@/design-system';
import { useAuth } from '@/contexts/AuthContext';
import { useOwnerIdentity } from '@/hooks/useOwnerIdentity';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';
import { clientsApi } from '@/modules/workspace/api/clients';
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

/** The sidebar list's scroll position, kept across page navigations (see below). */
let savedNavScroll = 0;

export function Sidebar({
  practiceName,
  ownerName,
  initials,
  trialDaysLeft = 28,
  onSignOut,
}: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  /** Resolve a nav label via its i18n key, falling back to the English label. */
  const navLabel = (key: string | undefined, fallback: string) =>
    key ? t(key, { defaultValue: fallback }) : fallback;
  // Real signed-in user's name for the footer block (prop is a fallback only).
  const { ownerName: resolvedOwnerName } = useOwnerIdentity();
  const { confirmSignOut } = useAuth();
  const { data: scope } = useScope();
  const isOwner = scope?.workspaceRole === 'owner' || !!scope?.isSuperAdmin;
  const nav = visibleOwnerNav(isOwner, scope, scope?.permissions);

  // Live attention counts for the sidebar badges. Polled so a new message or
  // join request surfaces without a manual refresh; paused when the tab is
  // hidden to avoid needless load.
  const { data: badges } = useQuery({
    queryKey: ['workspace', 'sidebar-badges'],
    queryFn: () => clientsApi.sidebarBadges(),
    enabled: !!scope?.workspaceId,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
  // Sign-out opens a confirmation dialog (handled globally in AuthProvider).
  const handleSignOut = onSignOut ?? confirmSignOut;
  // Remembered across pages and visits: every page mounts its own sidebar.
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    try { return localStorage.getItem('nusi:sidebar-collapsed') === '1'; } catch { return false; }
  });
  const setCollapsed = (next: (c: boolean) => boolean) => setCollapsedState((c) => {
    const v = next(c);
    try { localStorage.setItem('nusi:sidebar-collapsed', v ? '1' : '0'); } catch { /* private mode */ }
    return v;
  });

  // Expose the sidebar's current width as a CSS variable so the OwnerLayout
  // can pad the main content area without us hoisting collapse state up.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty(
      '--sidebar-width',
      collapsed ? '80px' : '236px',
    );
  }, [collapsed]);
  const { pathname } = useLocation();

  // Every owner page renders its own layout, so the sidebar mounts afresh on
  // each navigation and its list would snap back to the top: click Billing or
  // Team near the bottom and the sidebar "jumps up". So the list's scroll
  // position is carried across pages, restored before paint, and then nudged
  // just enough to keep the active item visible (the ACCOUNT group sits below
  // the trial card on shorter screens). Only the list scrolls, never the page.
  const navRef = useRef<HTMLElement | null>(null);
  const activeItemRef = useRef<HTMLAnchorElement | null>(null);
  const navItemsKey = nav.map((g) => g.items.map((i) => i.to).join(',')).join('|');
  useLayoutEffect(() => {
    const list = navRef.current;
    if (!list) return;
    list.scrollTop = savedNavScroll;

    const keepActiveVisible = () => {
      const item = activeItemRef.current;
      if (!item) return;
      const l = list.getBoundingClientRect();
      const i = item.getBoundingClientRect();
      if (i.top < l.top) list.scrollTop -= l.top - i.top + 8;
      else if (i.bottom > l.bottom) list.scrollTop += i.bottom - l.bottom + 8;
      savedNavScroll = list.scrollTop;
    };
    keepActiveVisible();

    // The list's height settles a moment after mount (the trial card and
    // profile render once their data arrives), so re-check while it settles,
    // then stop so later resizes never pull the list away from the user.
    const ro = new ResizeObserver(keepActiveVisible);
    ro.observe(list);
    const stop = window.setTimeout(() => ro.disconnect(), 1500);
    return () => { ro.disconnect(); window.clearTimeout(stop); };
  }, [pathname, navItemsKey, collapsed]);

  return (
    <aside
      className={cn(
        // fixed (not sticky) so parent overflow-hidden can't break it and the
        // sidebar stays put regardless of how the main content scrolls
        'fixed left-0 top-0 z-30 hidden h-screen flex-shrink-0 flex-col bg-canvas md:flex',
        collapsed ? 'w-[80px]' : 'w-[236px]',
        'transition-[width] duration-200 ease-out',
      )}
    >
      {/* Brand, with the collapse toggle inside the sidebar (never over the top bar). */}
      <div className={cn('flex flex-shrink-0', collapsed ? 'flex-col items-center gap-2.5 border-b border-foreground/[0.06] pb-3 pt-3' : 'h-16 items-center gap-2 pl-5 pr-3')}>
        <Link to="/dashboard" className="flex min-w-0 flex-1 items-center gap-2.5">
          <BrandMark size={28} animated={false} />
          {!collapsed && (
            <div className="flex min-w-0 flex-col gap-0.5 leading-none">
              <Wordmark className="text-[15px]" />
              <span className="truncate text-[10.5px] text-foreground/50">{practiceName}</span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            'flex flex-shrink-0 items-center justify-center rounded-lg transition-colors',
            collapsed
              ? 'w-[64px] flex-col gap-0.5 border border-foreground/10 py-1.5 text-[hsl(var(--brand-blue))] hover:bg-[hsl(var(--brand-blue)_/_0.08)]'
              : 'h-8 w-8 text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-4 w-4" />}
          {collapsed && <span className="text-[9.5px] font-bold">Expand</span>}
        </button>
      </div>

      {/* Workspace switcher - only renders for multi-workspace users */}
      {!collapsed && <WorkspaceSwitcher />}

      {/* Open: words and small icons, a thin green line on the open page.
          Collapsed: an icon rail with tiny labels and count badges. */}
      <nav
        ref={navRef}
        onScroll={(e) => { savedNavScroll = e.currentTarget.scrollTop; }}
        className={cn('scrollbar-hide flex flex-1 flex-col overflow-y-auto pb-4 pt-2', collapsed ? 'items-center px-2' : 'px-5')}
      >
        {nav.map((group, gi) => {
          const prev = gi > 0 ? nav[gi - 1] : null;
          const topGap = gi === 0 ? '' : !group.label && prev && !prev.label ? 'mt-1' : collapsed ? 'mt-3 border-t border-foreground/[0.06] pt-3' : 'mt-5';
          return (
          <div key={gi} className={cn(topGap, collapsed && 'w-full')}>
            {!collapsed && group.label && (
              <div className="mb-1.5 text-[11px] font-semibold text-foreground/45">
                {navLabel(group.labelKey, group.label)}
              </div>
            )}
            <ul className={cn('flex flex-col', collapsed ? 'items-center gap-1' : 'gap-0.5')}>
              {group.items.map((item) => {
                const active =
                  item.to === '/dashboard'
                    ? pathname === item.to
                    : pathname.startsWith(item.to);
                const Icon = item.icon;
                const count = item.badge ? (badges?.[item.badge] ?? 0) : 0;
                const label = navLabel(item.labelKey, item.label);
                if (collapsed) {
                  return (
                    <li key={item.to} className="w-full">
                      <Link
                        to={item.to}
                        ref={active ? activeItemRef : undefined}
                        title={label}
                        className={cn(
                          'relative flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors',
                          active
                            ? 'bg-[hsl(var(--brand-blue)_/_0.12)] text-[hsl(var(--brand-blue))]'
                            : 'text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground',
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                        <span className="max-w-full truncate text-[9.5px] font-semibold">{RAIL_LABEL[item.label] ?? label}</span>
                        {count > 0 && (
                          <span className="absolute right-1.5 top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                            {count > 9 ? '9+' : count}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      ref={active ? activeItemRef : undefined}
                      className={cn(
                        'relative flex items-center gap-2.5 py-[6px] pl-3 pr-1 text-[13.5px] transition-colors',
                        active ? 'font-bold text-foreground' : 'font-medium text-foreground/60 hover:text-foreground',
                      )}
                    >
                      <span className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-foreground/[0.07]" />
                      {active && (
                        <motion.span
                          layoutId="owner-nav-active"
                          className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-[hsl(var(--brand-blue))]"
                          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                        />
                      )}
                      <Icon className={cn('h-4 w-4 flex-shrink-0', active && 'text-[hsl(var(--brand-blue))]')} />
                      <span className="truncate">{label}</span>
                      {count > 0 && (
                        <span className="ml-auto text-[11px] font-bold text-rose-500" aria-label={`${count} unread or pending`}>
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                      {item.soon && (
                        <span className="ml-auto text-[10px] font-semibold text-amber-600 dark:text-amber-300">soon</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </nav>

      {/* Trial: one quiet line (the top bar carries Upgrade). */}
      {!collapsed && trialDaysLeft !== null && trialDaysLeft !== undefined && trialDaysLeft > 0 && (
        <button
          type="button"
          onClick={() => navigate('/billing')}
          className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-left text-[11.5px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/15"
        >
          <span>Trial · {trialDaysLeft} days left</span>
          <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-white">Upgrade</span>
        </button>
      )}

      {/* User */}
      <div className={cn('pb-4 pt-2', collapsed ? 'flex justify-center' : 'px-5')}>
        {collapsed ? (
          <WorkspaceProfileButton initials={initials} className="h-9 w-9" />
        ) : (
          <div className="flex items-center gap-2.5">
            <WorkspaceProfileButton initials={initials} className="h-8 w-8" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-foreground/80">{resolvedOwnerName || ownerName}</div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="grid h-7 w-7 place-items-center rounded-lg text-foreground/50 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Short names for the collapsed rail, where only a word or two fits. */
const RAIL_LABEL: Record<string, string> = {
  'Help & guides': 'Help',
  Appointments: 'Appts',
  Assessments: 'Assess',
  Notifications: 'Alerts',
  'Public page': 'Public',
  'Team chat': 'Chat',
  Organizations: 'Orgs',
};
