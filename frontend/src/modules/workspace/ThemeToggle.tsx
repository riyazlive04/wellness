import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type ThemeChoice = 'light' | 'system' | 'dark';

interface ThemeToggleProps {
  /**
   * Override the default wrapper classes (visibility / positioning per context).
   * Defaults to `'hidden md:flex'` so the Topbar's mobile behavior is kept.
   */
  className?: string;
}

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light',  label: 'Light',  icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark',   label: 'Dark',   icon: Moon },
];

/**
 * ThemeToggle — a button that opens a dropdown to pick Light / System / Dark.
 * The trigger shows the current mode's icon. Persists via next-themes
 * (localStorage key "sirah-ui-theme").
 */
export function ThemeToggle({ className = 'hidden md:flex' }: ThemeToggleProps = {}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  // Avoid hydration mismatch — next-themes resolves on the client.
  useEffect(() => setMounted(true), []);

  const raw = (mounted ? (theme as ThemeChoice) : 'system') ?? 'system';
  const current: ThemeChoice = OPTIONS.some((o) => o.value === raw) ? raw : 'system';
  const TriggerIcon = OPTIONS.find((o) => o.value === current)!.icon;

  /**
   * Apply a theme with a circular "reveal" wipe emanating from the click point,
   * using the View Transitions API. Falls back to an instant switch where the
   * API is unavailable or the user prefers reduced motion.
   */
  const applyTheme = (value: ThemeChoice, e: React.MouseEvent) => {
    const startViewTransition = (document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    }).startViewTransition;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!startViewTransition || reduceMotion) {
      setTheme(value);
      return;
    }

    const x = e.clientX;
    const y = e.clientY;
    const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    const transition = startViewTransition.call(document, () => setTheme(value));
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
        onClick={() => setOpen((o) => !o)}
        aria-label="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Theme"
        className="grid h-8 w-8 place-items-center rounded-lg border border-foreground/10 bg-foreground/[0.02] text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
      >
        <TriggerIcon className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-10 z-40 w-36 overflow-hidden rounded-xl border border-foreground/10 bg-surface-2 p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.45)]"
          >
            {OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = current === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={(e) => { applyTheme(value, e); setOpen(false); }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-foreground/[0.06]',
                    active ? 'text-foreground' : 'text-foreground/70',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="flex-1">{label}</span>
                  {active && <Check className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
