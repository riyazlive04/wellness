import { Bell, ChevronDown, HelpCircle, Menu, Search } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface TopbarProps {
  practiceName: string;
  /** Optional context message ("Last sync: 2 min ago" etc.) */
  context?: string;
  /** Callback to open the mobile drawer */
  onOpenMobileNav?: () => void;
}

export function Topbar({ practiceName, context, onOpenMobileNav }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-foreground/[0.06] bg-canvas/85 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2 px-4 md:gap-3 md:px-6">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="grid h-9 w-9 place-items-center rounded-lg text-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Workspace switcher (placeholder) */}
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] px-3 py-1.5 text-sm transition-colors hover:bg-foreground/[0.05]"
        >
          <span className="grid h-5 w-5 place-items-center rounded bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-[10px] font-medium text-foreground">
            {practiceName.charAt(0).toUpperCase()}
          </span>
          <span className="hidden font-medium sm:inline">{practiceName}</span>
          <ChevronDown className="h-3 w-3 text-foreground/75 dark:text-foreground/55" />
        </button>

        {context && (
          <span className="hidden text-xs text-foreground/75 dark:text-foreground/55 md:block">{context}</span>
        )}

        {/* Search */}
        <div className="relative ml-auto hidden w-64 lg:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
          <input
            type="search"
            placeholder="Search clients, programs…"
            className="w-full rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] py-1.5 pl-9 pr-3 text-sm placeholder:text-foreground/75 dark:text-foreground/60 focus:border-violet-400/50 focus:bg-foreground/[0.05] focus:outline-none"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-foreground/10 bg-foreground/[0.04] px-1.5 py-0.5 text-[9px] text-foreground/75 dark:text-foreground/55">
            ⌘K
          </kbd>
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ThemeToggle />
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label="Help"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="relative grid h-9 w-9 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-400" />
          </button>
        </div>
      </div>
    </header>
  );
}
