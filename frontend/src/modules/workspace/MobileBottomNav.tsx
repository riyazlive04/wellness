import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Users, ClipboardCheck, BarChart3, Menu, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface BottomTab {
  to: string;
  label: string;
  /** i18n key resolved at render; falls back to `label`. */
  labelKey: string;
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
  { to: '/dashboard', label: 'Home', labelKey: 'nav.home', icon: LayoutDashboard, end: true },
  { to: '/clients', label: 'Clients', labelKey: 'nav.clients', icon: Users },
  { to: '/assessments', label: 'Assess', labelKey: 'nav.assess', icon: ClipboardCheck },
  { to: '/analytics', label: 'Analytics', labelKey: 'nav.analytics', icon: BarChart3 },
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
  const { t } = useTranslation();
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
                isActive ? 'text-teal-600 dark:text-teal-300' : 'text-foreground/55',
              )
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')} />
                <span className="text-[10px] font-medium">{t(tab.labelKey, { defaultValue: tab.label })}</span>
              </>
            )}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={onMore}
          aria-label={t('nav.more')}
          className="touch-target flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-foreground/55 transition-colors active:text-foreground"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">{t('nav.more')}</span>
        </button>
      </div>
    </nav>
  );
}
