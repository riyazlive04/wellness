import { ChevronDown, ChevronLeft, Menu, RotateCw, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { StaffPushToggle } from '@/modules/activity/StaffPushToggle';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { NotificationsBell } from '@/modules/notifications/NotificationsBell';
import { staffNotifications } from '@/modules/notifications/notificationsApi';
import { openCommandPalette } from '@/modules/search/searchApi';

/** Detail / sub-page routes where a Back button helps you retrace your steps. */
const DETAIL_ROUTES = [
  /^\/clients\/[^/]+/,
  /^\/programs\/[^/]+/,
  /^\/appointments\/[^/]+/,
  /^\/messaging\/[^/]+/,
  /^\/dashboard\/nutrition\/(foods|recipes)\/[^/]+/,
];

interface TopbarProps {
  practiceName: string;
  /** Optional context message ("Last sync: 2 min ago" etc.) */
  context?: string;
  /** Callback to open the mobile drawer */
  onOpenMobileNav?: () => void;
}

/**
 * Owner topbar — calm by design. Mirrors the admin layout's "one identity
 * pill + status text + lightweight actions" pattern. Search is now an icon
 * button (Cmd+K) instead of a visible input; the input came back when we
 * have a real search index. Help was removed — settings carries those links.
 */
export function Topbar({ practiceName, context, onOpenMobileNav }: TopbarProps) {
  const { logoUrl } = useWorkspaceBrand();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isDetail = DETAIL_ROUTES.some((re) => re.test(pathname));
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/' + (pathname.split('/').filter(Boolean)[0] ?? ''));
  };

  return (
    <header className="sticky top-0 z-20 border-b border-foreground/[0.06] bg-canvas/85 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="grid h-9 w-9 place-items-center rounded-lg text-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Back - shown on detail / sub pages */}
        {isDetail && (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.02] px-3 py-1 text-xs font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            aria-label="Go back"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}

        {/* Workspace switcher - single identity pill, same shape as admin's */}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-1 text-xs transition-colors hover:bg-foreground/[0.05]"
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-4 w-4 rounded object-cover" />
          ) : (
            <span className="grid h-4 w-4 place-items-center rounded bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.40)] to-[hsl(var(--brand-magenta)_/_0.30)] text-[9px] font-medium text-foreground">
              {practiceName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="hidden font-medium sm:inline">{practiceName}</span>
          <ChevronDown className="h-3 w-3 text-foreground/55" />
        </button>

        {context && (
          <span className="hidden text-xs text-foreground/55 md:block">{context}</span>
        )}

        {/* Lightweight actions on the right: search + push + theme + notifications. */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Refresh - reloads the whole page. Always shown (not just mobile) so
              there's a consistent reload control next to search on every page. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="grid h-9 w-9 place-items-center rounded-lg text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label="Refresh"
            title="Refresh"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={openCommandPalette}
            className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.02] px-3 py-1.5 text-xs text-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground/80"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden rounded border border-foreground/15 px-1 text-[10px] lg:inline">⌘K</kbd>
          </button>
          <span className="hidden sm:inline-flex"><StaffPushToggle /></span>
          <ThemeToggle />
          <NotificationsBell surface={staffNotifications} />
        </div>
      </div>
    </header>
  );
}
