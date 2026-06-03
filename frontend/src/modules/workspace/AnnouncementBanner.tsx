import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, Info, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { adminApi, type ActiveAnnouncement } from '@/modules/super-admin/api/admin';

const DISMISSED_KEY = 'sirah:announcements:dismissed';

function loadDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function saveDismissed(s: Set<string>): void {
  try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

/**
 * Slim banner that surfaces super-admin announcements at the top of the
 * workspace shell. Dismissals are persisted per-browser in localStorage so
 * users don't see the same notice every page load. Critical (non-dismissible)
 * announcements ignore the dismissal.
 *
 * Polls /api/v1/announcements/active every 60s for fresh announcements
 * (e.g. an announcement published while the user has the app open).
 */
export function AnnouncementBanner() {
  const { data } = useQuery<{ items: ActiveAnnouncement[] }>({
    queryKey: ['announcements', 'active'],
    queryFn: () => adminApi.activeAnnouncements(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });

  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  // Keep storage in sync if other tabs dismiss.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISMISSED_KEY) setDismissed(loadDismissed());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const items = (data?.items ?? []).filter((a) => !(a.dismissible && dismissed.has(a.id)));
  if (items.length === 0) return null;

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  }

  return (
    <div className="space-y-2 px-4 pt-3 md:px-6">
      {items.map((a) => <BannerRow key={a.id} a={a} onDismiss={() => dismiss(a.id)} />)}
    </div>
  );
}

function BannerRow({ a, onDismiss }: { a: ActiveAnnouncement; onDismiss: () => void }) {
  const Icon = a.severity === 'critical' ? AlertOctagon : a.severity === 'warning' ? AlertTriangle : Info;
  const tone = {
    critical: 'border-rose-400/40   bg-rose-400/10   text-rose-700 dark:text-rose-200',
    warning:  'border-amber-300/40  bg-amber-300/10  text-amber-700 dark:text-amber-200',
    info:     'border-violet-400/40 bg-violet-400/10 text-violet-700 dark:text-violet-200',
  }[a.severity];
  const iconTone = {
    critical: 'text-rose-700 dark:text-rose-300',
    warning:  'text-amber-700 dark:text-amber-300',
    info:     'text-violet-700 dark:text-violet-300',
  }[a.severity];

  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-3 py-2.5', tone)}>
      <Icon className={cn('h-4 w-4 flex-shrink-0 mt-0.5', iconTone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{a.title}</div>
        <div className="mt-0.5 text-sm">{a.body}</div>
      </div>
      {a.dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
