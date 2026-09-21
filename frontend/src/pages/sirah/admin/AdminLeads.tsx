import { useMemo, useState } from 'react';
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
import { Download, GripVertical, Mail, MessageCircle, Phone, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { WhatsappLinkCard } from './WhatsappLinkCard';

/**
 * Leads from the landing page form (Meta ads traffic), as a sales board.
 *
 * One column per stage of a demo-led sale: New → Contacted → Demo done →
 * Won / Lost. Drag a card between columns, or use the stage picker on the card
 * (the fallback for phones and keyboards). Moves are optimistic — the card
 * jumps immediately and snaps back if the save fails.
 *
 * Read straight from Supabase: the `leads` table's RLS lets super_admins
 * SELECT/UPDATE and nobody else read at all. `status` is free text, so adding a
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
}

const STAGES = [
  { value: 'new',       label: 'New',       dot: 'bg-teal-500',    head: 'text-teal-800 dark:text-teal-200' },
  { value: 'contacted', label: 'Contacted', dot: 'bg-blue-500',    head: 'text-blue-700 dark:text-blue-300' },
  { value: 'demo_done', label: 'Demo done', dot: 'bg-violet-500',  head: 'text-violet-700 dark:text-violet-300' },
  { value: 'won',       label: 'Won',       dot: 'bg-emerald-500', head: 'text-emerald-700 dark:text-emerald-300' },
  { value: 'lost',      label: 'Lost',      dot: 'bg-foreground/35', head: 'text-foreground/60' },
] as const;

type StageValue = (typeof STAGES)[number]['value'];

const SIZE_LABELS: Record<string, string> = {
  solo: 'Just me',
  small: '2 - 5 people',
  large: '6 or more',
};

const db = supabase as SupabaseClient;

/** Unknown statuses (older rows, typos) land in New rather than vanishing. */
function stageOf(lead: Lead): StageValue {
  return (STAGES.find((s) => s.value === lead.status)?.value ?? 'new') as StageValue;
}

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
    mutationFn: async ({ id, status }: { id: string; status: StageValue }) => {
      const { error } = await db.from('leads').update({ status }).eq('id', id);
      if (error) throw error;
    },
    // Optimistic: move the card now, roll back if the save is refused.
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'leads'] });
      const previous = queryClient.getQueryData<Lead[]>(['admin', 'leads']);
      queryClient.setQueryData<Lead[]>(['admin', 'leads'], (old = []) =>
        old.map((l) => (l.id === id ? { ...l, status } : l)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'leads'], ctx.previous);
      toast.error('Could not move the lead. Please try again.');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'leads'] });
    },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => [l.name, l.phone, l.email, l.city ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [leads, search]);

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
    if (!target) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || stageOf(lead) === target) return;
    moveLead.mutate({ id: leadId, status: target });
  }

  function exportCsv() {
    const header = ['Received', 'Name', 'Phone', 'Email', 'City', 'Practice size', 'Source', 'Stage', 'Notes'];
    const rows = visible.map((l) => [
      new Date(l.created_at).toISOString(),
      l.name,
      l.phone,
      l.email,
      l.city ?? '',
      SIZE_LABELS[l.practice_size ?? ''] ?? l.practice_size ?? '',
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

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
              Operations · Leads
            </span>
            <h1 className="text-balance mt-1">Landing page leads</h1>
            <p className="mt-2 text-sm text-foreground/60">
              {columns.new.length} new · {columns.contacted.length} contacted · {columns.demo_done.length} demo done ·{' '}
              {columns.won.length} won. Drag a card to move it along.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email or city"
                className="w-full rounded-full border border-foreground/12 bg-foreground/[0.03] py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-foreground/40 focus:border-teal-600/50 focus:outline-none focus:ring-4 focus:ring-teal-500/15"
              />
            </div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!visible.length}
              className="inline-flex items-center gap-2 rounded-full border border-foreground/15 px-4 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        </motion.div>

        <motion.div variants={fadeUp}>
          <WhatsappLinkCard />
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
                <div className="grid min-w-[1100px] grid-cols-5 gap-4">
                  {STAGES.map((stage) => (
                    <StageColumn
                      key={stage.value}
                      stage={stage}
                      leads={columns[stage.value]}
                      onMove={(id, status) => moveLead.mutate({ id, status })}
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

function StageColumn({
  stage,
  leads,
  onMove,
}: {
  stage: (typeof STAGES)[number];
  leads: Lead[];
  onMove: (id: string, status: StageValue) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.value });

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
            Drop a lead here
          </div>
        ) : (
          leads.map((lead) => <LeadCard key={lead.id} lead={lead} onMove={onMove} />)
        )}
      </div>
    </div>
  );
}

function LeadCard({ lead, onMove }: { lead: Lead; onMove: (id: string, status: StageValue) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const source = formatSource(lead.source);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border border-foreground/[0.08] bg-card p-3 shadow-sm transition-shadow',
        isDragging ? 'z-50 cursor-grabbing shadow-xl ring-2 ring-teal-500/40' : 'hover:shadow-md',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={`Drag ${lead.name}`}
          className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-foreground/30 hover:bg-foreground/[0.05] hover:text-foreground/60 active:cursor-grabbing"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{lead.name}</span>
            {lead.source?.phone_verified === true || String(lead.source?.phone_verified) === 'true' ? (
              <span title="Phone verified by WhatsApp code" className="flex-shrink-0 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                Verified
              </span>
            ) : (
              <span title="Phone not verified" className="flex-shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/50">
                Not verified
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-foreground/50">
            {lead.city && <span>{lead.city}</span>}
            {lead.practice_size && <span>{SIZE_LABELS[lead.practice_size] ?? lead.practice_size}</span>}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        <a
          href={`tel:${lead.phone}`}
          title={lead.phone}
          className="grid h-8 w-8 place-items-center rounded-lg border border-foreground/10 text-foreground/65 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <Phone className="h-3.5 w-3.5" />
        </a>
        <a
          href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          title="WhatsApp"
          className="grid h-8 w-8 place-items-center rounded-lg border border-foreground/10 text-foreground/65 transition-colors hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
        <a
          href={`mailto:${lead.email}`}
          title={lead.email}
          className="grid h-8 w-8 place-items-center rounded-lg border border-foreground/10 text-foreground/65 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <Mail className="h-3.5 w-3.5" />
        </a>
        <select
          aria-label={`Stage for ${lead.name}`}
          value={stageOf(lead)}
          onChange={(e) => onMove(lead.id, e.target.value as StageValue)}
          className="ml-auto rounded-lg border border-foreground/10 bg-transparent px-1.5 py-1.5 text-[11px] text-foreground/70 focus:border-teal-600/50 focus:outline-none"
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 text-[11px] text-foreground/45">
        {lead.phone} · {formatWhen(lead.created_at)}
        {source && <span className="block truncate">via {source}</span>}
      </div>
    </div>
  );
}
