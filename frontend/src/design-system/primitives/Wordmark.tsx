import { cn } from '@/lib/utils';

/**
 * Wordmark — the "NUSI" logotype, coloured to match the logo mark: leaf green
 * sweeping into the mark's cyan leaf accent. Rendered as gradient-clipped text
 * so it stays crisp at any size.
 *
 * Light theme uses deeper greens so the text keeps contrast on white; dark
 * theme uses the logo's bright lime, which glows the way the mark does.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      aria-label="NUSI"
      className={cn(
        'select-none bg-clip-text font-extrabold tracking-tight text-transparent',
        'bg-[linear-gradient(100deg,#3B8A0E_0%,#5DAE12_55%,#1597BF_100%)]',
        'dark:bg-[linear-gradient(100deg,#8FDD2E_0%,#B4EE4A_55%,#3CC6EE_100%)]',
        className,
      )}
    >
      NUSI
    </span>
  );
}
