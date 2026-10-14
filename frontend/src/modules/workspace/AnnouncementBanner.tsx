import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, Megaphone, X } from 'lucide-react';

import { adminApi, type ActiveAnnouncement } from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

const STORE_KEY = 'nusi:dismissed-announcements';

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

const TONE: Record<ActiveAnnouncement['severity'], { box: string; icon: typeof Info }> = {
  info: { box: 'border-sky-400/30 bg-sky-500/[0.08] text-sky-900 dark:text-sky-100', icon: Megaphone },
  warning: { box: 'border-amber-400/40 bg-amber-500/[0.10] text-amber-900 dark:text-amber-100', icon: AlertTriangle },
  critical: { box: 'border-rose-400/40 bg-rose-500/[0.10] text-rose-900 dark:text-rose-100', icon: AlertTriangle },
};

/**
 * Platform announcements from NUSI (Super admin → Announcements), shown under
 * the topbar. The server filters by practice and role; the most important one
 * shows first. Dismissible notices stay hidden once closed, on this browser.
 */
export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const q = useQuery({
    queryKey: ['announcements', 'active'],
    queryFn: adminApi.activeAnnouncements,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const items = (q.data?.items ?? []).filter((a) => !(a.dismissible && dismissed.includes(a.id)));
  if (!items.length) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* private mode — hidden for this session only */
    }
  };

  return (
    <div className="space-y-2 px-4 pt-3 md:px-6">
      {items.slice(0, 3).map((a) => {
        const tone = TONE[a.severity] ?? TONE.info;
        const Icon = tone.icon;
        return (
          <div key={a.id} role="status" className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm', tone.box)}>
            <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{a.title}</div>
              <div className="mt-0.5 whitespace-pre-line opacity-85">{a.body}</div>
            </div>
            {a.dismissible && (
              <button type="button" onClick={() => dismiss(a.id)} aria-label="Dismiss" className="rounded-full p-1 opacity-60 hover:bg-black/5 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
