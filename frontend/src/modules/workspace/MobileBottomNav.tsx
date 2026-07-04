import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ClipboardCheck, BarChart3, Menu, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface BottomTab {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match nested routes (NavLink `end={false}`). */
  end?: boolean;
}

/**
 * The 5-slot owner bottom bar: 4 primary destinations + a "More" launcher that
 * opens the full sidebar drawer (which holds the other ~19 nav items). Chosen
 * to mirror the client portal's bottom-tab pattern so both roles feel like the
 * same native app.
 */
const TABS: BottomTab[] = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/assessments', label: 'Assess', icon: ClipboardCheck },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

interface MobileBottomNavProps {
  /** Open the full navigation drawer (the existing MobileSidebar). */
  onMore: () => void;
}

/**
 * MobileBottomNav — iOS/Material-style bottom tab bar for the owner shell on
 * phones. Frosted glass, safe-area aware, hidden from `md:` up where the real
 * sidebar takes over. Render once inside OwnerLayout.
 */
export function MobileBottomNav({ onMore }: MobileBottomNavProps) {
  return (
    <nav
      className="no-select fixed inset-x-0 bottom-0 z-30 border-t border-foreground/[0.06] bg-canvas/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16 items-center justify-around px-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'touch-target flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors',
                isActive ? 'text-violet-600 dark:text-violet-300' : 'text-foreground/55',
              )
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={onMore}
          aria-label="More"
          className="touch-target flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-foreground/55 transition-colors active:text-foreground"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>
    </nav>
  );
}
