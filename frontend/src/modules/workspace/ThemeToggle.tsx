import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type ThemeChoice = 'light' | 'dark' | 'system';

/**
 * ThemeToggle — three-way segmented control (light · system · dark).
 * Lives in the Topbar; persists via next-themes (localStorage key "sirah-ui-theme").
 */
export function ThemeToggle() {
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
      className="hidden items-center gap-0.5 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-0.5 md:flex"
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
                : 'text-foreground/45 hover:bg-foreground/[0.05] hover:text-foreground/75',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
