import { cn } from '@/lib/utils';

/**
 * Page footer bar shown at the bottom of the shells — copyright on the left,
 * "Powered by Sirah Digital" (linking to the Sirah Digital site) on the right.
 * `showPoweredBy={false}` hides the attribution for white-label client portals.
 */
export function AppFooter({
  practiceName,
  showPoweredBy = true,
  className,
}: {
  practiceName?: string;
  showPoweredBy?: boolean;
  className?: string;
}) {
  const year = new Date().getFullYear();
  const name = practiceName?.trim() || 'NUSI';
  return (
    // Pinned to the bottom of the shell's scroll area: `mt-auto` pushes it down
    // when content is short, `sticky bottom-0` keeps it in view while scrolling
    // long pages. A frosted, opaque background so scrolling content passes
    // cleanly underneath. Requires the parent scroll container to be a flex
    // column (OwnerLayout / ClientLayout `<main class="flex flex-col …">`).
    <footer className={cn('sticky bottom-0 z-20 mt-auto flex-shrink-0 border-t border-foreground/[0.06] bg-canvas/85 px-6 py-3.5 backdrop-blur-xl', className)}>
      {/* pr on desktop keeps the right-side attribution clear of the floating
          assistant button that sits in the bottom-right corner. */}
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-xs text-foreground/60 sm:flex-row md:pr-20">
        <span>© {year} {name}. All rights reserved.</span>
        {showPoweredBy && (
          <span className="flex items-center gap-1">
            Powered by{' '}
            <a
              href="https://sirahdigital.in/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-foreground transition-colors hover:underline"
            >
              Sirah Digital
            </a>
          </span>
        )}
      </div>
    </footer>
  );
}
