import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Loader2, Search, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { Sheet } from '@/components/Sheet';
import { cn } from '@/lib/utils';
import { clientsApi } from '../api/clients';
import type { MealSlot } from '../api/mealPlans';
import { DEFAULT_MEAL_TIMES, remindersApi, type QuickReminderKind } from '../api/reminders';
import { usePracticeSchedule } from './usePracticeSchedule';

const KINDS: Array<{ kind: QuickReminderKind; emoji: string; label: string; hint: string }> = [
  { kind: 'water', emoji: '💧', label: 'Drink water', hint: '"Time for a glass of water"' },
  { kind: 'meal', emoji: '🍽️', label: 'Meal time', hint: '"Time for your lunch"' },
  { kind: 'log_meal', emoji: '📸', label: 'Log a meal', hint: '"Log your lunch"' },
  { kind: 'custom', emoji: '⏰', label: 'Your words', hint: 'Anything, e.g. "Go for a walk"' },
];

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Send a one-off reminder right now. It pops up in the client's NUSI app (or
 * as a phone notification when the app is closed). With `clients` it goes to
 * those clients; without, the nutritionist picks any number of clients.
 */
export function QuickReminderSheet({ clients, onClose }: { clients?: Array<{ id: string; name: string }>; onClose: () => void }) {
  const schedule = usePracticeSchedule();
  // Preselect the meal time closest to now.
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nearest =
    [...schedule].sort(
      (a, b) =>
        Math.abs(toMinutes(DEFAULT_MEAL_TIMES[a.slot]) - nowMin) - Math.abs(toMinutes(DEFAULT_MEAL_TIMES[b.slot]) - nowMin),
    )[0]?.slot ?? 'lunch';
  const [kind, setKind] = useState<QuickReminderKind>('water');
  const [slot, setSlot] = useState<MealSlot>(nearest);
  const [message, setMessage] = useState('');
  const [picked, setPicked] = useState<Map<string, string>>(() => new Map((clients ?? []).map((c) => [c.id, c.name])));
  const fixed = !!clients;

  const send = useMutation({
    mutationFn: () =>
      remindersApi.quick({
        clientIds: [...picked.keys()],
        kind,
        ...(kind === 'meal' || kind === 'log_meal' ? { slot } : {}),
        ...(kind === 'custom' ? { message: message.trim() } : {}),
      }),
    onSuccess: (r) => {
      const who = picked.size === 1 ? [...picked.values()][0] : `${r.sent} clients`;
      if (r.sent === 0) toast.info('Already sent in the last 2 minutes, so it wasn’t sent again.');
      else toast.success(`Sent. It pops up in ${who}'s NUSI app${r.skipped ? ` (${r.skipped} skipped: sent in the last 2 minutes)` : ''}.`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not send the reminder'),
  });

  const canSend = picked.size > 0 && (kind !== 'custom' || message.trim().length > 0);
  const target = fixed && clients!.length === 1 ? clients![0].name : null;

  return (
    <Sheet onClose={() => !send.isPending && onClose()} ariaLabel="Quick reminder" className="sm:max-w-lg">
      <div className="flex items-start justify-between gap-3 border-b border-foreground/[0.06] px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Quick reminder{target ? ` to ${target}` : ''}</h2>
          <p className="mt-0.5 text-xs text-foreground/60">Pops up in the NUSI app right away, or as a phone notification if the app is closed.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.06]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => setKind(k.kind)}
              className={cn(
                'rounded-2xl border p-3 text-left transition-colors',
                kind === k.kind ? 'border-teal-500/60 bg-teal-500/10' : 'border-foreground/10 hover:bg-foreground/[0.03]',
              )}
            >
              <div className="text-xl">{k.emoji}</div>
              <div className="mt-1 text-sm font-semibold">{k.label}</div>
              <div className="text-[11px] text-foreground/55">{k.hint}</div>
            </button>
          ))}
        </div>

        {(kind === 'meal' || kind === 'log_meal') && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/70">Which meal</div>
            <div className="flex flex-wrap gap-2">
              {schedule.map((e) => (
                <button
                  key={e.slot}
                  type="button"
                  onClick={() => setSlot(e.slot)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium',
                    slot === e.slot ? 'border-teal-500/60 bg-teal-500/10 text-teal-800 dark:text-teal-200' : 'border-foreground/10 text-foreground/70',
                  )}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {kind === 'custom' && (
          <label className="block">
            <div className="mb-1.5 text-xs font-medium text-foreground/70">Message</div>
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="e.g. Time for your evening walk 🚶"
              className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
            />
          </label>
        )}

        {!fixed && <ClientPicker picked={picked} setPicked={setPicked} />}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.06] px-5 py-4">
        <span className="text-xs text-foreground/60">{fixed ? '' : `${picked.size} picked`}</span>
        <button
          type="button"
          disabled={!canSend || send.isPending}
          onClick={() => send.mutate()}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
        >
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send now
        </button>
      </div>
    </Sheet>
  );
}

function ClientPicker({ picked, setPicked }: { picked: Map<string, string>; setPicked: (fn: (m: Map<string, string>) => Map<string, string>) => void }) {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const clientsQ = useQuery({
    queryKey: ['workspace', 'clients', 'quick-reminder', q],
    queryFn: () => clientsApi.list({ q: q || undefined, limit: 50 }),
    staleTime: 30_000,
  });
  const options = clientsQ.data?.items ?? [];
  const toggle = (id: string, name: string) =>
    setPicked((cur) => {
      const next = new Map(cur);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });
  const allPicked = options.length > 0 && options.every((c) => picked.has(c.id));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-foreground/70">
        Send to
        {options.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setPicked((cur) => {
                const next = new Map(cur);
                for (const c of options) {
                  if (allPicked) next.delete(c.id);
                  else next.set(c.id, c.display_name || c.name);
                }
                return next;
              })
            }
            className="font-semibold text-teal-700 hover:underline dark:text-teal-300"
          >
            {allPicked ? 'Clear these' : `Pick all ${options.length} shown`}
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients by name or email"
          className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] py-2.5 pl-9 pr-3.5 text-sm focus:border-teal-400/60 focus:outline-none"
        />
      </div>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-foreground/[0.08]">
        {clientsQ.isLoading ? (
          <div className="flex items-center gap-2 px-3.5 py-3 text-xs text-foreground/55"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading clients…</div>
        ) : clientsQ.isError ? (
          <div className="flex items-center justify-between gap-2 px-3.5 py-3 text-xs text-rose-600 dark:text-rose-300">
            Couldn&apos;t load your clients.
            <button type="button" onClick={() => void clientsQ.refetch()} className="font-semibold underline">Try again</button>
          </div>
        ) : options.length === 0 ? (
          <div className="px-3.5 py-3 text-xs text-foreground/55">{q ? `No client matches "${q}".` : 'No clients yet.'}</div>
        ) : (
          options.map((c) => {
            const name = c.display_name || c.name;
            const on = picked.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id, name)}
                className={cn('flex w-full items-center gap-3 border-b border-foreground/[0.05] px-3.5 py-2.5 text-left last:border-b-0', on ? 'bg-teal-500/10' : 'hover:bg-foreground/[0.03]')}
              >
                <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border', on ? 'border-teal-600 bg-teal-600 text-white' : 'border-foreground/25')}>
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{name}</span>
                  <span className="block truncate text-[11px] text-foreground/55">{c.email}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
