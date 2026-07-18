import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  /**
   * Override the default wrapper classes (visibility / positioning per context).
   * Defaults to `'hidden md:flex'` so the Topbar's mobile behavior is kept.
   */
  className?: string;
}

/**
 * ThemeToggle — a single button that flips between Light and Dark on click
 * (no menu). The icon shows the current mode; clicking switches to the other
 * with a circular View-Transitions "reveal" wipe from the click point (falls
 * back to an instant switch where unavailable / reduced motion). Persists via
 * next-themes (localStorage key "sirah-ui-theme"); tracks `resolvedTheme` so an
 * inherited "system" default still reflects the actually-applied theme.
 */
export function ThemeToggle({ className = 'hidden md:flex' }: ThemeToggleProps = {}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — next-themes resolves on the client.
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';
  const next = isDark ? 'light' : 'dark';

  const toggle = (e: React.MouseEvent) => {
    const startViewTransition = (document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    }).startViewTransition;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!startViewTransition || reduceMotion) {
      setTheme(next);
      return;
    }

    const x = e.clientX;
    const y = e.clientY;
    const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    const transition = startViewTransition.call(document, () => setTheme(next));
    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        { duration: 480, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
      );
    });
  };

  return (
    <div className={cn('relative items-center', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`Switch to ${next} mode`}
        title={`Switch to ${next} mode`}
        className="grid h-8 w-8 place-items-center rounded-lg border border-foreground/10 bg-foreground/[0.02] text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>
    </div>
  );
}
