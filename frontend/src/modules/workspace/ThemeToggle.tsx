import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type ThemeChoice = 'light' | 'dark' | 'system';

interface ThemeToggleProps {
  /**
   * Override the default container classes. Use this to control visibility
   * + positioning per-context. Defaults to `'hidden md:flex'` which keeps
   * the Topbar's mobile behavior intact.
   */
  className?: string;
}

/**
 * ThemeToggle — three-way segmented control (light · system · dark).
 * Used in the Topbar (default — hidden on mobile) and on Auth page (always
 * visible, positioned top-right). Persists via next-themes (localStorage
 * key "sirah-ui-theme").
 */
export function ThemeToggle({ className = 'hidden md:flex' }: ThemeToggleProps = {}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — next-themes resolves on the client.
  useEffect(() => setMounted(true), []);

  const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: 'light',  label: 'Light',  icon: Sun },
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'dark',   label: 'Dark',   icon: Moon },
  ];

  const current = (mounted ? theme : 'system') as ThemeChoice;

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        'items-center gap-0.5 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-0.5 backdrop-blur-xl',
        className,
      )}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'grid h-7 w-7 place-items-center rounded-md transition-all',
              active
                ? 'bg-foreground/10 text-foreground shadow-sm'
                : 'text-foreground/75 dark:text-foreground/60 hover:bg-foreground/[0.05] hover:text-foreground/75',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
