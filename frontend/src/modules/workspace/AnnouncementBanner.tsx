import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, Megaphone, X } from 'lucide-react';

import { adminApi, type AnnouncementSeverity } from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

const STORE_KEY = 'nusi:dismissed-announcements';

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/**
 * Deliberately seamless with the topbar above it rather than a card floating
 * under it: the slot already holds the trial and AI strips, and a notice that
 * looks bolted on gets read as an ad.
 *
 * `info` continues the topbar's dark green, so the banner reads as part of the
 * chrome. Warning and critical keep amber and rose - urgency still has to be
 * able to shout.
 */
const TONE: Record<AnnouncementSeverity, { box: string; dismissHover: string; icon: typeof Info }> = {
  info: {
    box: 'bg-teal-900 text-teal-50 dark:bg-teal-950 dark:text-teal-100',
    // Light tint: a dark one vanishes on the dark green.
    dismissHover: 'hover:bg-white/20',
    icon: Megaphone,
  },
  warning: { box: 'bg-amber-500/15 text-amber-900 dark:text-amber-100', dismissHover: 'hover:bg-foreground/10', icon: AlertTriangle },
  critical: { box: 'bg-rose-500/15 text-rose-900 dark:text-rose-100', dismissHover: 'hover:bg-foreground/10', icon: AlertTriangle },
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
    <div>
      {items.slice(0, 3).map((a) => {
        const tone = TONE[a.severity] ?? TONE.info;
        const Icon = tone.icon;
        return (
          <div key={a.id} role="status" className={cn('flex items-center gap-3 px-4 py-2 text-xs md:px-6', tone.box)}>
            <Icon className="h-4 w-4 flex-shrink-0" />
            {/* Title and body on one line: these sit directly under the
                topbar, where a two-line block pushes the page down. The admin
                body field is a free textarea, so a long one is ellipsised
                rather than allowed to wrap the strip to two lines. */}
            <span className="min-w-0 flex-1 truncate" title={a.body ? `${a.title} — ${a.body}` : a.title}>
              <span className="font-semibold">{a.title}</span>
              {a.body ? <span className="opacity-85"> — {a.body}</span> : null}
            </span>
            {a.dismissible && (
              <button type="button" onClick={() => dismiss(a.id)} aria-label="Dismiss"
                className={cn(
                  'grid h-6 w-6 flex-shrink-0 place-items-center rounded-full opacity-60 transition hover:opacity-100',
                  tone.dismissHover,
                )}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
