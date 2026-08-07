import { cn } from '@/lib/utils';

/**
 * Wordmark — the "NUSI" logotype: geometric caps in the signature
 * blue → violet → magenta gradient (the "Aura" direction). Rendered as
 * gradient-clipped text so it stays crisp at any size and in both themes.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      aria-label="NUSI"
      className={cn('select-none bg-clip-text font-extrabold tracking-tight text-transparent', className)}
      style={{ backgroundImage: 'linear-gradient(100deg, #2F6BFF 0%, #8B5CF6 48%, #E24DA0 100%)' }}
    >
      NUSI
    </span>
  );
}
