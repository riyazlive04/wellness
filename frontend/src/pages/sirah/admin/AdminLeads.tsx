import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  CalendarCheck, CalendarClock, Copy, ChevronLeft, ChevronRight, Download, GripVertical, Mail, MessageCircle, Phone, Search,
  Trash2, UserPlus, Users, Video, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/lib/api';
import { WhatsappLinkCard } from './WhatsappLinkCard';
import { MoveLeadDialog, type PendingMove } from './MoveLeadDialog';

/**
 * Leads from the landing page form (Meta ads traffic), as a sales board.
 *
 * One column per stage of a demo-led sale: New → Contacted → Not attended →
 * Demo done → Nurturing → Won / Lost. Drag a card between columns, or use the stage picker on the card
 * (the fallback for phones and keyboards). Moves are optimistic — the card
 * jumps immediately and snaps back if the save fails.
 *
 * Read straight from Supabase (the `leads` table's RLS lets super_admins read,
 * and nobody else); stage moves go through the API so the lead gets that
 * stage's WhatsApp message. `status` is free text, so adding a
 * stage needs no migration. The generated Database types don't include the
 * table, so this module goes through the untyped client.
 */

interface Lead {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string;
  city: string | null;
  practice_size: string | null;
  source: (Record<string, string> & { phone_verified?: boolean | string }) | null;
  status: string;
  notes: string | null;
  slot_start: string | null;
}

const STAGES = [
  // Verified their WhatsApp number on the form but left without booking. Filled
  // by the server only - nobody moves a lead in here, only out (after a call).
  { value: 'unbooked',  label: "Didn't book", dot: 'bg-orange-500', head: 'text-orange-700 dark:text-orange-300' },
  { value: 'new',       label: 'New',       dot: 'bg-teal-500',    head: 'text-teal-800 dark:text-teal-200' },
  { value: 'contacted', label: 'Contacted', dot: 'bg-blue-500',    head: 'text-blue-700 dark:text-blue-300' },
  { value: 'no_show',   label: 'Not attended', dot: 'bg-amber-500', head: 'text-amber-700 dark:text-amber-300' },
  { value: 'demo_done', label: 'Demo done', dot: 'bg-violet-500',  head: 'text-violet-700 dark:text-violet-300' },
  { value: 'nurturing', label: 'Nurturing', dot: 'bg-sky-500',     head: 'text-sky-700 dark:text-sky-300' },
  { value: 'won',       label: 'Won',       dot: 'bg-teal-500', head: 'text-teal-700 dark:text-teal-300' },
  { value: 'lost',      label: 'Lost',      dot: 'bg-foreground/35', head: 'text-foreground/60' },
] as const;

type StageValue = (typeof STAGES)[number]['value'];

const isUnbooked = (lead: Lead) => lead.status === 'unbooked';

const SIZE_LABELS: Record<string, string> = {
  solo: 'Just me',
  small: '2 - 5 people',
  large: '6 or more',
};

/** Google Meet link created with the booking's calendar event, if any. */
function meetUrlOf(lead: Lead): string | null {
  const url = lead.source?.meet_url;
  return typeof url === 'string' && url.startsWith('https://meet.google.com/') ? url : null;
}

/** Which WhatsApp call reminders (1 hour / 5 minutes before) have gone out. */
function remindersOf(lead: Lead): { '1h': boolean; '5m': boolean } {
  const sent = (lead.source as { reminders?: Record<string, string> } | null)?.reminders ?? {};
  return { '1h': !!sent['1h'], '5m': !!sent['5m'] };
}

/** The lead's own answer to "What is the purpose of the call?". */
function purposeOf(lead: Lead): string {
  return lead.source?.purpose ?? '';
}

/** The "completed a nutrition degree" tick; null for leads booked before the question existed. */
function hasDegree(lead: Lead): boolean | null {
  const answer = (lead.source as { nutrition_degree?: boolean } | null)?.nutrition_degree;
  return typeof answer === 'boolean' ? answer : null;
}

function degreeOf(lead: Lead): string {
  const answer = hasDegree(lead);
  if (answer === null) return '';
  return answer ? 'Nutrition degree' : 'No nutrition degree';
}

const db = supabase as SupabaseClient;

/** Unknown statuses (older rows, typos) land in New rather than vanishing. */
function stageOf(lead: Lead): StageValue {
  return (STAGES.find((s) => s.value === lead.status)?.value ?? 'new') as StageValue;
}

/** "Thu 24 Sep, 03:30 pm" in IST - the call time the lead chose. */
function formatSlot(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/** Demo calls are 45 minutes (see backend call-slots.ts). */
const CALL_MINUTES = 45;

/** YYYY-MM-DD of an instant, in IST - how calls are grouped into days. */
function istDay(d: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(d));
}

/** The IST day `n` days after the given YYYY-MM-DD. */
function shiftDay(day: string, n: number): string {
  return istDay(new Date(new Date(`${day}T12:00:00+05:30`).getTime() + n * 86_400_000));
}

function formatDayHeading(day: string) {
  return new Date(`${day}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

/** "24 Sept" in IST - the weekday is already in the date heading above the card. */
function formatShortDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

type CallFilter = 'all' | 'today' | 'tomorrow' | 'week' | 'date' | 'none';
type ReceivedFilter = 'all' | 'today' | '7d' | '30d';
type GroupBy = 'call' | 'received';

/** "Today", "Tomorrow", "Yesterday" or "Wed, 23 Sept" for an IST day. */
function dayLabel(day: string): string {
  const today = istDay(new Date());
  if (day === today) return 'Today';
  if (day === shiftDay(today, 1)) return 'Tomorrow';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  return new Date(`${day}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * A column's leads under date headings. By call date: soonest day first,
 * earliest call first within a day, leads without a call last. By date
 * received: newest day first, newest lead first.
 */
function groupByDay(leads: Lead[], by: GroupBy): Array<{ key: string; label: string; leads: Lead[] }> {
  const groups = new Map<string, Lead[]>();
  for (const l of leads) {
    const key = by === 'call' ? (l.slot_start ? istDay(l.slot_start) : 'none') : istDay(l.created_at);
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const time = (l: Lead) => new Date(by === 'call' ? l.slot_start ?? l.created_at : l.created_at).getTime();
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === 'none') return 1;
      if (b === 'none') return -1;
      return by === 'call' ? a.localeCompare(b) : b.localeCompare(a);
    })
    .map(([key, items]) => ({
      key,
      label: key === 'none' ? 'No call booked' : dayLabel(key),
      leads: items.sort((x, y) => (by === 'call' ? time(x) - time(y) : time(y) - time(x))),
    }));
}

const CALL_FILTERS: Array<{ value: CallFilter; label: string }> = [
  { value: 'all', label: 'Call: any date' },
  { value: 'today', label: 'Call: today' },
  { value: 'tomorrow', label: 'Call: tomorrow' },
  { value: 'week', label: 'Call: next 7 days' },
  { value: 'date', label: 'Call: pick a date…' },
  { value: 'none', label: 'Call: none booked' },
];

const RECEIVED_FILTERS: Array<{ value: ReceivedFilter; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "ig · nusi-bo-static" from the utm parameters captured with the lead. */
function formatSource(source: Lead['source']) {
  if (!source) return '';
  const parts = [source.utm_source, source.utm_campaign].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  if (source.fbclid) return 'Meta ad';
  if (source.referrer) {
    try {
      return new URL(source.referrer).hostname.replace('www.', '');
    } catch {
      return '';
    }
  }
  return '';
}

export default function AdminLeads() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [callFilter, setCallFilter] = useState<CallFilter>('all');
  const [callDate, setCallDate] = useState(() => istDay(new Date()));
  const [sizeFilter, setSizeFilter] = useState<string>('all');
  const [receivedFilter, setReceivedFilter] = useState<ReceivedFilter>('all');
  const [agendaDay, setAgendaDay] = useState(() => istDay(new Date()));
  const [groupBy, setGroupBy] = useState<GroupBy>('call');
  const filtersActive = callFilter !== 'all' || sizeFilter !== 'all' || receivedFilter !== 'all' || search.trim() !== '';

  function clearFilters() {
    setSearch('');
    setCallFilter('all');
    setSizeFilter('all');
    setReceivedFilter('all');
  }

  const { data: leads = [], isLoading, isError } = useQuery<Lead[]>({
    queryKey: ['admin', 'leads'],
    queryFn: async () => {
      const { data, error } = await db
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const moveLead = useMutation({
    // Through the server, not a direct table update: it sends the stage's
    // message to the lead when the admin chose to (notify).
    mutationFn: ({ id, status, notify }: { id: string; status: StageValue; notify: boolean }) =>
      api.patch<{ status: string; whatsapp_sent: boolean; email_sent?: boolean }>(`/api/v1/admin/leads/${id}/status`, { body: { status, notify } }),
    // Optimistic: move the card now, roll back if the save is refused.
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'leads'] });
      const previous = queryClient.getQueryData<Lead[]>(['admin', 'leads']);
      queryClient.setQueryData<Lead[]>(['admin', 'leads'], (old = []) =>
        old.map((l) => (l.id === id ? { ...l, status } : l)),
      );
      return { previous };
    },
    onSuccess: (res, { id }) => {
      const channels = [res?.whatsapp_sent && 'WhatsApp', res?.email_sent && 'Email'].filter(Boolean);
      if (channels.length) {
        const lead = queryClient.getQueryData<Lead[]>(['admin', 'leads'])?.find((l) => l.id === id);
        toast.success(`${channels.join(' and ')} sent to ${lead?.name || lead?.phone || 'the lead'}.`);
      }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'leads'], ctx.previous);
      toast.error('Could not move the lead. Please try again.');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'leads'] });
    },
  });

  const deleteLead = useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: true }>(`/api/v1/admin/leads/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'leads'] });
      const previous = queryClient.getQueryData<Lead[]>(['admin', 'leads']);
      queryClient.setQueryData<Lead[]>(['admin', 'leads'], (old = []) => old.filter((l) => l.id !== id));
      return { previous };
    },
    onSuccess: () => toast.success('Lead deleted.'),
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'leads'], ctx.previous);
      toast.error('Could not delete the lead. Please try again.');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'leads'] });
    },
  });

  // Every stage change asks first: the dialog shows what the move would send
  // the lead, and the admin changes the stage with or without the message.
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  function requestMove(id: string, status: StageValue) {
    const lead = leads.find((l) => l.id === id);
    if (!lead || stageOf(lead) === status) return;
    setPendingMove({
      id,
      name: lead.name || lead.phone,
      status,
      stageLabel: STAGES.find((s) => s.value === status)?.label ?? status,
    });
  }
  function confirmMove(notify: boolean) {
    if (!pendingMove) return;
    moveLead.mutate({ id: pendingMove.id, status: pendingMove.status as StageValue, notify });
    if (!notify) toast.success(`${pendingMove.name} moved to ${pendingMove.stageLabel}. No message sent.`);
    setPendingMove(null);
  }

  function markNotAttended(lead: Lead) {
    requestMove(lead.id, 'no_show');
  }

  function confirmDelete(lead: Lead) {
    if (window.confirm(`Delete ${lead.name || lead.phone}? This cannot be undone.`)) deleteLead.mutate(lead.id);
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = istDay(new Date());
    const tomorrow = shiftDay(today, 1);
    const weekEnd = shiftDay(today, 7);
    const receivedSince =
      receivedFilter === 'today' ? today : receivedFilter === '7d' ? shiftDay(today, -6) : receivedFilter === '30d' ? shiftDay(today, -29) : '';

    return leads.filter((l) => {
      if (q && ![l.name, l.phone, l.email, l.city ?? ''].some((v) => v.toLowerCase().includes(q))) return false;
      if (sizeFilter !== 'all' && l.practice_size !== sizeFilter) return false;
      if (receivedSince && istDay(l.created_at) < receivedSince) return false;
      if (callFilter !== 'all') {
        if (callFilter === 'none') return !l.slot_start;
        if (!l.slot_start) return false;
        const day = istDay(l.slot_start);
        if (callFilter === 'today' && day !== today) return false;
        if (callFilter === 'tomorrow' && day !== tomorrow) return false;
        if (callFilter === 'week' && (day < today || day >= weekEnd)) return false;
        if (callFilter === 'date' && day !== callDate) return false;
      }
      return true;
    });
  }, [leads, search, sizeFilter, receivedFilter, callFilter, callDate]);

  const agenda = useMemo(
    () =>
      leads
        .filter((l) => l.slot_start && istDay(l.slot_start) === agendaDay)
        .sort((a, b) => new Date(a.slot_start!).getTime() - new Date(b.slot_start!).getTime()),
    [leads, agendaDay],
  );

  const columns = useMemo(() => {
    const byStage = Object.fromEntries(STAGES.map((s) => [s.value, [] as Lead[]])) as Record<StageValue, Lead[]>;
    for (const l of visible) byStage[stageOf(l)].push(l);
    return byStage;
  }, [visible]);

  // A small drag distance / touch delay keeps taps on the call and WhatsApp
  // links working instead of starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    const leadId = String(e.active.id);
    const target = e.over?.id as StageValue | undefined;
    if (!target || target === 'unbooked') return;
    requestMove(leadId, target);
  }

  function exportCsv() {
    const header = ['Received', 'Name', 'Phone', 'Email', 'City', 'Practice size', 'Nutrition degree', 'Call slot (IST)', 'Purpose of call', 'Source', 'Stage', 'Notes'];
    const rows = visible.map((l) => [
      new Date(l.created_at).toISOString(),
      l.name,
      l.phone,
      l.email,
      l.city ?? '',
      SIZE_LABELS[l.practice_size ?? ''] ?? l.practice_size ?? '',
      hasDegree(l) === null ? '' : hasDegree(l) ? 'Yes' : 'No',
      l.slot_start ? formatSlot(l.slot_start) : '',
      purposeOf(l),
      formatSource(l.source),
      STAGES.find((s) => s.value === stageOf(l))?.label ?? l.status,
      l.notes ?? '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `nusi-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stats = useMemo(() => {
    const now = Date.now();
    const today = istDay(new Date());
    const weekAgo = shiftDay(today, -6);
    // Counts are of real bookings; the "Didn't book" column shows its own count.
    const booked = leads.filter((l) => !isUnbooked(l));
    return [
      { label: 'Total leads', value: booked.length, icon: Users },
      {
        label: 'Upcoming calls',
        value: leads.filter((l) => l.slot_start && new Date(l.slot_start).getTime() > now).length,
        icon: CalendarCheck,
      },
      { label: 'Calls today', value: leads.filter((l) => l.slot_start && istDay(l.slot_start) === today).length, icon: CalendarClock },
      { label: 'New this week', value: booked.filter((l) => istDay(l.created_at) >= weekAgo).length, icon: UserPlus },
    ];
  }, [leads]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-10 md:px-8 md:py-12">
      <MoveLeadDialog move={pendingMove} onCancel={() => setPendingMove(null)} onConfirm={confirmMove} />
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
              Operations · Leads
            </span>
            <h1 className="text-balance mt-1">Leads</h1>
            <p className="mt-2 text-sm text-foreground/60">
              Demo bookings from the landing page. Drag a card between stages, or use its stage picker.
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!visible.length}
            className="inline-flex items-center gap-2 rounded-xl border border-foreground/15 px-4 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </motion.div>

        <motion.div variants={fadeUp}>
          <WhatsappLinkCard />
        </motion.div>

        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((stat) => (
            <Glass key={stat.label} className="flex items-center gap-4 p-5">
              <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl border border-foreground/10 bg-foreground/[0.03] text-foreground/75">
                <stat.icon className="h-5 w-5" />
              </span>
              <div>
                <div className="text-2xl font-semibold leading-none text-foreground">{isLoading ? '–' : stat.value}</div>
                <div className="mt-1.5 text-xs uppercase tracking-[0.16em] text-foreground/55">{stat.label}</div>
              </div>
            </Glass>
          ))}
        </motion.div>

        <motion.div variants={fadeUp}>
          <DayAgenda
            day={agendaDay}
            calls={agenda}
            onDay={setAgendaDay}
            onAttended={(lead) => requestMove(lead.id, 'demo_done')}
            onNotAttended={markNotAttended}
          />
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="flex flex-wrap items-center gap-2.5 p-4">
            <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email or city"
                className="w-full rounded-xl border border-foreground/12 bg-foreground/[0.03] py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-foreground/40 focus:border-teal-600/50 focus:outline-none focus:ring-4 focus:ring-teal-500/15"
              />
            </div>
            <FilterSelect
              label="Date received"
              value={receivedFilter}
              onChange={(v) => setReceivedFilter(v as ReceivedFilter)}
              options={RECEIVED_FILTERS}
            />
            <FilterSelect
              label="Sort"
              value={groupBy}
              onChange={(v) => setGroupBy(v as GroupBy)}
              options={[
                { value: 'call', label: 'Sort: call date' },
                { value: 'received', label: 'Sort: newest received' },
              ]}
              neutral
            />
            <FilterSelect label="Call date" value={callFilter} onChange={(v) => setCallFilter(v as CallFilter)} options={CALL_FILTERS} />
            {callFilter === 'date' && (
              <input
                type="date"
                aria-label="Call date"
                value={callDate}
                onChange={(e) => e.target.value && setCallDate(e.target.value)}
                className="rounded-xl border border-foreground/12 bg-foreground/[0.03] px-3.5 py-2 text-sm text-foreground focus:border-teal-600/50 focus:outline-none"
              />
            )}
            <FilterSelect
              label="Practice size"
              value={sizeFilter}
              onChange={setSizeFilter}
              options={[
                { value: 'all', label: 'Practice size: all' },
                ...Object.entries(SIZE_LABELS).map(([value, label]) => ({ value, label: `Practice size: ${label}` })),
              ]}
            />
            {filtersActive && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-foreground/55">
                  Showing {visible.length} of {leads.length}
                </span>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-teal-700 hover:bg-teal-500/10 dark:text-teal-300"
                >
                  <X className="h-3.5 w-3.5" /> Clear filters
                </button>
              </div>
            )}
          </Glass>
        </motion.div>

        <motion.div variants={fadeUp}>
          {isError ? (
            <Glass className="p-8 text-center text-sm text-foreground/65">
              Could not load leads. This page is for Sirah Digital super admins only - if that is you and
              this keeps happening, the `leads` read policy may be missing in Supabase.
            </Glass>
          ) : isLoading ? (
            <Glass className="p-8 text-center text-sm text-foreground/60">Loading leads…</Glass>
          ) : (
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              <div className="-mx-6 overflow-x-auto px-6 pb-4 md:-mx-8 md:px-8">
                <div className="grid min-w-[1920px] grid-cols-8 gap-4">
                  {STAGES.map((stage) => (
                    <StageColumn
                      key={stage.value}
                      stage={stage}
                      leads={columns[stage.value]}
                      groupBy={groupBy}
                      onMove={(id, status) => requestMove(id, status)}
                      onDelete={confirmDelete}
                    />
                  ))}
                </div>
              </div>
            </DndContext>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

/** Copies the Meet link, e.g. to paste into a WhatsApp chat by hand. */
function CopyMeetLink({ url }: { url: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Meet link copied.');
    } catch {
      toast.error('Could not copy - select the link and copy it instead.');
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy Meet link"
      aria-label="Copy Meet link"
      className="inline-flex items-center gap-1 rounded-md border border-foreground/10 px-1.5 py-0.5 text-[11px] font-medium text-foreground/65 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
    >
      <Copy className="h-3 w-3" /> Copy
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  neutral,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  /** Not a filter (e.g. grouping) - never shown as "active". */
  neutral?: boolean;
}) {
  const active = !neutral && value !== 'all';
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-teal-500/15',
        active
          ? 'border-teal-600/50 bg-teal-500/10 font-medium text-teal-800 dark:text-teal-200'
          : 'border-foreground/12 bg-foreground/[0.03] text-foreground/75',
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** One day's booked demo calls, in time order, with prev / next / today. */
function DayAgenda({
  day,
  calls,
  onDay,
  onAttended,
  onNotAttended,
}: {
  day: string;
  calls: Lead[];
  onDay: (day: string) => void;
  onAttended: (lead: Lead) => void;
  onNotAttended: (lead: Lead) => void;
}) {
  const today = istDay(new Date());
  const now = Date.now();
  const label =
    day === today ? 'Today' : day === shiftDay(today, 1) ? 'Tomorrow' : day === shiftDay(today, -1) ? 'Yesterday' : '';

  return (
    <Glass className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-foreground/55">Demo calls</div>
          <h2 className="mt-0.5 text-lg font-semibold text-foreground">
            {label && <span className="text-teal-700 dark:text-teal-300">{label} · </span>}
            {formatDayHeading(day)}
            <span className="ml-2 text-sm font-normal text-foreground/55">
              {calls.length} {calls.length === 1 ? 'call' : 'calls'}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onDay(shiftDay(day, -1))}
            aria-label="Previous day"
            className="grid h-9 w-9 place-items-center rounded-full border border-foreground/12 text-foreground/70 hover:bg-foreground/[0.05]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDay(today)}
            disabled={day === today}
            className="rounded-full border border-foreground/12 px-3.5 py-2 text-xs font-medium text-foreground/75 hover:bg-foreground/[0.05] disabled:opacity-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onDay(shiftDay(day, 1))}
            aria-label="Next day"
            className="grid h-9 w-9 place-items-center rounded-full border border-foreground/12 text-foreground/70 hover:bg-foreground/[0.05]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <input
            type="date"
            aria-label="Pick a day"
            value={day}
            onChange={(e) => e.target.value && onDay(e.target.value)}
            className="ml-1 rounded-full border border-foreground/12 bg-foreground/[0.03] px-3 py-1.5 text-sm text-foreground focus:border-teal-600/50 focus:outline-none"
          />
        </div>
      </div>

      {calls.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-foreground/12 p-5 text-center text-sm text-foreground/50">
          No demo calls booked for this day.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-foreground/[0.07]">
          {calls.map((lead) => {
            const start = new Date(lead.slot_start!);
            const end = new Date(start.getTime() + CALL_MINUTES * 60_000);
            const done = end.getTime() < now;
            const live = start.getTime() <= now && !done;
            const stage = STAGES.find((s) => s.value === stageOf(lead))!;
            const meetUrl = meetUrlOf(lead);
            // Once the call has started, the team records whether it happened.
            const awaitingOutcome = start.getTime() <= now && (stage.value === 'new' || stage.value === 'contacted');
            return (
              <li
                key={lead.id}
                className={cn('flex flex-wrap items-start gap-x-4 gap-y-2 py-3', done && !awaitingOutcome && 'opacity-55')}
              >
                <div className="w-40 flex-shrink-0">
                  <div className="text-sm font-semibold text-foreground">
                    {formatTime(start)} – {formatTime(end)}
                  </div>
                  {live && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> Now
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{lead.name}</span>
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', stage.head)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', stage.dot)} />
                      {stage.label}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-foreground/55">
                    <span>{lead.phone}</span>
                    {lead.city && <span>· {lead.city}</span>}
                    {lead.practice_size && <span>· {SIZE_LABELS[lead.practice_size] ?? lead.practice_size}</span>}
                    {degreeOf(lead) && <span>· {degreeOf(lead)}</span>}
                  </div>
                  {purposeOf(lead) && <p className="mt-1 line-clamp-2 text-xs text-foreground/70">{purposeOf(lead)}</p>}
                  {meetUrl && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <a
                        href={meetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-300"
                      >
                        <Video className="h-3.5 w-3.5" /> {meetUrl.replace('https://', '')}
                      </a>
                      <CopyMeetLink url={meetUrl} />
                    </div>
                  )}
                  <p className="mt-1 text-xs text-foreground/45">
                    WhatsApp reminders: 1 hour before {remindersOf(lead)['1h'] ? '✓ sent' : '· pending'} · 5 min before{' '}
                    {remindersOf(lead)['5m'] ? '✓ sent' : '· pending'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {awaitingOutcome && (
                    <>
                      <button
                        type="button"
                        onClick={() => onAttended(lead)}
                        className="rounded-lg border border-teal-600/30 px-2.5 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-500/10 dark:text-teal-300"
                      >
                        Attended
                      </button>
                      <button
                        type="button"
                        onClick={() => onNotAttended(lead)}
                        className="rounded-lg border border-amber-600/30 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                      >
                        Not attended
                      </button>
                    </>
                  )}
                  {meetUrl && !done && (
                    <a
                      href={meetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800 dark:bg-teal-600"
                    >
                      <Video className="h-3.5 w-3.5" /> Join Meet
                    </a>
                  )}
                  <a
                    href={`tel:${lead.phone}`}
                    title={`Call ${lead.phone}`}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-foreground/10 text-foreground/65 hover:bg-foreground/[0.05] hover:text-foreground"
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </a>
                  <a
                    href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    title="WhatsApp"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-foreground/10 text-foreground/65 hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-300"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Glass>
  );
}

function StageColumn({
  stage,
  leads,
  groupBy,
  onMove,
  onDelete,
}: {
  stage: (typeof STAGES)[number];
  leads: Lead[];
  groupBy: GroupBy;
  onMove: (id: string, status: StageValue) => void;
  onDelete: (lead: Lead) => void;
}) {
  const fillsItself = stage.value === 'unbooked';
  const { setNodeRef, isOver } = useDroppable({ id: stage.value, disabled: fillsItself });

  return (
    <div
      ref={setNodeRef}
      data-stage={stage.value}
      className={cn(
        'flex min-h-[420px] flex-col rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-3 transition-colors',
        isOver && 'border-teal-500/50 bg-teal-500/[0.06]',
      )}
    >
      <div className="flex items-center justify-between px-1 pb-3">
        <span className={cn('inline-flex items-center gap-2 text-sm font-semibold', stage.head)}>
          <span className={cn('h-2 w-2 rounded-full', stage.dot)} />
          {stage.label}
        </span>
        <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs text-foreground/60">{leads.length}</span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5">
        {leads.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-foreground/10 p-4 text-center text-xs text-foreground/40">
            {fillsItself ? 'Verified their WhatsApp number but left without booking' : 'Drop a lead here'}
          </div>
        ) : (
          groupByDay(leads, groupBy).map((group) => (
            <div key={group.key} className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 px-1 pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/55">
                <span>{group.label}</span>
                <span className="h-px flex-1 bg-foreground/10" />
                <span className="font-normal normal-case tracking-normal text-foreground/40">{group.leads.length}</span>
              </div>
              {group.leads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onMove={onMove} onDelete={onDelete} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  onMove,
  onDelete,
}: {
  lead: Lead;
  onMove: (id: string, status: StageValue) => void;
  onDelete: (lead: Lead) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const [showFullPurpose, setShowFullPurpose] = useState(false);
  // "Show more" only when the three-line preview actually cuts text off -
  // measured, since how much fits depends on the column width.
  const purposeRef = useRef<HTMLParagraphElement>(null);
  const [purposeClipped, setPurposeClipped] = useState(false);
  const purpose = purposeOf(lead);
  useLayoutEffect(() => {
    const el = purposeRef.current;
    if (el && !showFullPurpose) setPurposeClipped(el.scrollHeight > el.clientHeight + 1);
  }, [purpose, showFullPurpose]);
  const source = formatSource(lead.source);
  const verified = lead.source?.phone_verified === true || String(lead.source?.phone_verified) === 'true';
  const meetUrl = meetUrlOf(lead);
  const details = [
    lead.city,
    lead.practice_size ? SIZE_LABELS[lead.practice_size] ?? lead.practice_size : null,
    degreeOf(lead),
  ].filter(Boolean);
  const iconButton =
    'grid h-8 flex-1 place-items-center rounded-lg border border-foreground/10 text-foreground/65 transition-colors';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border border-foreground/[0.08] bg-card p-3.5 shadow-sm transition-shadow',
        isDragging ? 'z-50 cursor-grabbing shadow-xl ring-2 ring-teal-500/40' : 'hover:shadow-md',
      )}
    >
      {/* Name row - the drag handle lives here only, so everything below shares one left edge. */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Drag ${lead.name}`}
          className="-ml-1 flex-shrink-0 cursor-grab touch-none rounded p-0.5 text-foreground/30 hover:bg-foreground/[0.05] hover:text-foreground/60 active:cursor-grabbing"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {/* Wraps rather than truncates: the card is narrow and the full name matters on a call. */}
        <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-foreground">
          {lead.name || <span className="font-normal italic text-foreground/50">Name not given</span>}
        </span>
        <span
          title={verified ? 'Phone verified by WhatsApp code' : 'Phone not verified'}
          className={cn(
            'flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
            verified ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300' : 'bg-foreground/[0.06] text-foreground/50',
          )}
        >
          {verified ? 'Verified' : 'Not verified'}
        </span>
      </div>

      {details.length > 0 && <div className="mt-1 text-xs text-foreground/55">{details.join(' · ')}</div>}

      {lead.slot_start && (
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-teal-500/10 px-2.5 py-1.5 text-xs font-semibold text-teal-800 dark:text-teal-200">
          <span className="flex min-w-0 items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{formatShortDay(lead.slot_start)}</span>
          </span>
          <span className="flex-shrink-0">{formatTime(new Date(lead.slot_start))}</span>
        </div>
      )}

      {meetUrl && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <a
            href={meetUrl}
            target="_blank"
            rel="noreferrer"
            title={meetUrl}
            className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-300"
          >
            <Video className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate">Join Meet</span>
          </a>
          <CopyMeetLink url={meetUrl} />
        </div>
      )}

      {purpose && (
        <div className="mt-2.5 text-xs">
          <div className="font-medium text-teal-700 dark:text-teal-300">Purpose of call</div>
          <p
            ref={purposeRef}
            className={cn('mt-0.5 whitespace-pre-line break-words text-foreground/70', !showFullPurpose && 'line-clamp-3')}
          >
            {purpose}
          </p>
          {(purposeClipped || showFullPurpose) && (
            <button
              type="button"
              onClick={() => setShowFullPurpose((v) => !v)}
              className="mt-1 text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-300"
            >
              {showFullPurpose ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-1.5">
        <a href={`tel:${lead.phone}`} title={`Call ${lead.phone}`} className={cn(iconButton, 'hover:bg-foreground/[0.05] hover:text-foreground')}>
          <Phone className="h-3.5 w-3.5" />
        </a>
        <a
          href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          title="WhatsApp"
          className={cn(iconButton, 'hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-300')}
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
        {lead.email && (
          <a href={`mailto:${lead.email}`} title={lead.email} className={cn(iconButton, 'hover:bg-foreground/[0.05] hover:text-foreground')}>
            <Mail className="h-3.5 w-3.5" />
          </a>
        )}
        <button
          type="button"
          onClick={() => onDelete(lead)}
          title="Delete lead"
          aria-label={`Delete ${lead.name}`}
          className={cn(iconButton, 'text-foreground/50 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <select
        aria-label={`Stage for ${lead.name}`}
        value={stageOf(lead)}
        onChange={(e) => onMove(lead.id, e.target.value as StageValue)}
        className="mt-2 w-full rounded-lg border border-foreground/10 bg-transparent px-2.5 py-1.5 text-xs font-medium text-foreground/80 focus:border-teal-600/50 focus:outline-none"
      >
        {/* "Didn't book" is only ever the starting point, never a place to move a lead to. */}
        {STAGES.filter((s) => s.value !== 'unbooked' || isUnbooked(lead)).map((s) => (
          <option key={s.value} value={s.value} disabled={s.value === 'unbooked'}>
            {s.label}
          </option>
        ))}
      </select>

      <div className="mt-3 border-t border-foreground/[0.07] pt-2.5 text-xs text-foreground/50">
        <div className="font-medium text-foreground/70">{lead.phone}</div>
        {lead.email && <div className="mt-0.5 break-all text-foreground/65">{lead.email}</div>}
        <div className="mt-0.5">{isUnbooked(lead) ? 'Verified' : 'Received'} {formatWhen(lead.created_at)}</div>
        {source && <div className="mt-0.5 truncate">via {source}</div>}
      </div>
    </div>
  );
}
