import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react';

import { BrandMark, Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import { OWNER_NAV } from './nav';

interface SidebarProps {
  /** Workspace identity for the footer block */
  practiceName: string;
  ownerName: string;
  initials: string;
  /** Days remaining in trial — null hides the trial card */
  trialDaysLeft?: number | null;
  onSignOut?: () => void;
}

export function Sidebar({
  practiceName,
  ownerName,
  initials,
  trialDaysLeft = 28,
  onSignOut,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen flex-shrink-0 flex-col border-r border-foreground/[0.06] bg-canvas md:flex',
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
              <span className="truncate text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                {practiceName}
              </span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="grid h-7 w-7 place-items-center rounded-lg text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {OWNER_NAV.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && 'mt-6')}>
            {!collapsed && group.label && (
              <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-foreground/30">
                {group.label}
              </div>
            )}
            <ul className="space-y-0.5">
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
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
                        active
                          ? 'bg-foreground/[0.06] text-foreground'
                          : 'text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground/90',
                        collapsed && 'justify-center px-0',
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="owner-nav-active"
                          className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-gradient-to-b from-blue-600 to-fuchsia-500"
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        />
                      )}
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {item.soon && (
                            <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-foreground/55">
                              soon
                            </span>
                          )}
                        </>
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
              <span className="text-[10px] text-foreground/55">{trialDaysLeft}d left</span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.04]">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-fuchsia-500"
                style={{ width: `${Math.min(100, (trialDaysLeft / 30) * 100)}%` }}
              />
            </div>
            <button
              type="button"
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
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-xs font-medium">
            {initials}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-xs font-medium">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{ownerName}</div>
              <div className="truncate text-[11px] text-foreground/55">Workspace owner</div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="grid h-7 w-7 place-items-center rounded-lg text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
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
