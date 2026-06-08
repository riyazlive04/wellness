import { Bell, ChevronDown, Menu, Search } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

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

        {/* Workspace switcher — single identity pill, same shape as admin's */}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-1 text-xs transition-colors hover:bg-foreground/[0.05]"
        >
          <span className="grid h-4 w-4 place-items-center rounded bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-[9px] font-medium text-foreground">
            {practiceName.charAt(0).toUpperCase()}
          </span>
          <span className="hidden font-medium sm:inline">{practiceName}</span>
          <ChevronDown className="h-3 w-3 text-foreground/55" />
        </button>

        {context && (
          <span className="hidden text-xs text-foreground/55 md:block">{context}</span>
        )}

        {/* Lightweight actions on the right. ThemeToggle is already compact,
            search collapses to a Cmd+K affordance, and the bell stays. */}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="hidden h-8 items-center gap-2 rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] px-2.5 text-xs text-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground md:inline-flex"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className="rounded border border-foreground/10 bg-foreground/[0.04] px-1 py-px text-[9px] text-foreground/55">⌘K</kbd>
          </button>
          <ThemeToggle />
          <button
            type="button"
            className="relative grid h-8 w-8 place-items-center rounded-lg text-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-400" />
          </button>
        </div>
      </div>
    </header>
  );
}
