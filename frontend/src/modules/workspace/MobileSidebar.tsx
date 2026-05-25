import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LogOut } from 'lucide-react';

import { BrandMark, Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import { OWNER_NAV } from './nav';

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
  practiceName: string;
  ownerName: string;
  initials: string;
  trialDaysLeft?: number | null;
  onSignOut?: () => void;
}

/**
 * MobileSidebar — slide-in drawer version of the owner sidebar.
 * Triggered by the hamburger in Topbar on screens narrower than md.
 */
export function MobileSidebar({
  open,
  onClose,
  practiceName,
  ownerName,
  initials,
  trialDaysLeft = 28,
  onSignOut,
}: MobileSidebarProps) {
  const { pathname } = useLocation();

  // Close the drawer when the route changes
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            aria-hidden
          />

          {/* Drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-white/[0.06] bg-[#0B0D12] md:hidden"
            role="dialog"
            aria-label="Navigation"
          >
            {/* Brand */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-4">
              <Link to="/sirah/dashboard" onClick={onClose} className="flex items-center gap-3">
                <BrandMark size={28} animated={false} />
                <div className="flex flex-col leading-none">
                  <span className="text-sm font-semibold tracking-tight">SIRAH LIFE</span>
                  <span className="truncate text-[10px] uppercase tracking-[0.18em] text-white/40">
                    {practiceName}
                  </span>
                </div>
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-white/55 hover:bg-white/[0.05] hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-3 py-4">
              {OWNER_NAV.map((group, gi) => (
                <div key={gi} className={cn(gi > 0 && 'mt-6')}>
                  {group.label && (
                    <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/30">
                      {group.label}
                    </div>
                  )}
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const active =
                        item.to === '/sirah/dashboard'
                          ? pathname === item.to
                          : pathname.startsWith(item.to);
                      const Icon = item.icon;
                      return (
                        <li key={item.to}>
                          <Link
                            to={item.to}
                            onClick={onClose}
                            className={cn(
                              'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
                              active
                                ? 'bg-white/[0.06] text-white'
                                : 'text-white/55 hover:bg-white/[0.04] hover:text-white/90',
                            )}
                          >
                            {active && (
                              <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-gradient-to-b from-indigo-400 to-emerald-400" />
                            )}
                            <Icon className="h-4 w-4 flex-shrink-0" />
                            <span className="flex-1">{item.label}</span>
                            {item.soon && (
                              <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-white/40">
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
            {trialDaysLeft !== null && trialDaysLeft !== undefined && trialDaysLeft > 0 && (
              <div className="px-3 pb-3">
                <Glass className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Trial</span>
                    <span className="text-[10px] text-white/40">{trialDaysLeft}d left</span>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-400 to-emerald-400"
                      style={{ width: `${Math.min(100, (trialDaysLeft / 30) * 100)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-lg bg-gradient-to-br from-indigo-500/30 to-emerald-400/20 px-3 py-1.5 text-xs font-medium text-white hover:from-indigo-500/40 hover:to-emerald-400/30"
                  >
                    Upgrade now
                  </button>
                </Glass>
              </div>
            )}

            {/* User block */}
            <div className="border-t border-white/[0.06] p-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500/40 to-emerald-400/30 text-xs font-medium">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{ownerName}</div>
                  <div className="truncate text-[11px] text-white/40">Workspace owner</div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="grid h-7 w-7 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
                  aria-label="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
