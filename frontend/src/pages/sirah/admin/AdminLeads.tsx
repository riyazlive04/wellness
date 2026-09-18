import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, Mail, MessageCircle, Phone, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

/**
 * Leads from the landing page form (Meta ads traffic).
 *
 * Read straight from Supabase rather than through the API: the `leads` table's
 * RLS policy lets super_admins SELECT/UPDATE, and nobody else read at all. The
 * generated Database types don't include the table, so this module goes through
 * the untyped client.
 */

interface Lead {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string;
  city: string | null;
  practice_size: string | null;
  source: Record<string, string> | null;
  status: string;
  notes: string | null;
}

const STATUSES = [
  { value: 'new',       label: 'New',       tone: 'bg-teal-500/12 text-teal-800 dark:text-teal-200' },
  { value: 'contacted', label: 'Contacted', tone: 'bg-blue-500/12 text-blue-700 dark:text-blue-300' },
  { value: 'won',       label: 'Won',       tone: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
  { value: 'lost',      label: 'Lost',      tone: 'bg-foreground/[0.07] text-foreground/60' },
] as const;

const SIZE_LABELS: Record<string, string> = {
  solo: 'Just me',
  small: '2 - 5 people',
  large: '6 or more',
};

const db = supabase as SupabaseClient;

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "ig · nusi-bo-static" from the utm parameters captured with the lead. */
function formatSource(source: Lead['source']) {
  if (!source) return '—';
  const parts = [source.utm_source, source.utm_campaign].filter(Boolean);
  if (!parts.length && source.fbclid) return 'Meta ad';
  if (!parts.length && source.referrer) return new URL(source.referrer).hostname.replace('www.', '');
  return parts.join(' · ') || '—';
}

export default function AdminLeads() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

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

  const updateStatus = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await db.from('leads').update({ status: value }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'leads'] });
    },
    onError: () => toast.error('Could not update the lead.'),
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (status && l.status !== status) return false;
      if (!q) return true;
      return [l.name, l.phone, l.email, l.city ?? '']. some((v) => v.toLowerCase().includes(q));
    });
  }, [leads, search, status]);

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: leads.length };
    for (const s of STATUSES) base[s.value] = leads.filter((l) => l.status === s.value).length;
    return base;
  }, [leads]);

  function exportCsv() {
    const header = ['Received', 'Name', 'Phone', 'Email', 'City', 'Practice size', 'Source', 'Status', 'Notes'];
    const rows = visible.map((l) => [
      new Date(l.created_at).toISOString(),
      l.name,
      l.phone,
      l.email,
      l.city ?? '',
      SIZE_LABELS[l.practice_size ?? ''] ?? l.practice_size ?? '',
      formatSource(l.source),
      l.status,
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
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
              Operations · Leads
            </span>
            <h1 className="text-balance mt-1">Landing page leads</h1>
            <p className="mt-2 text-sm text-foreground/60">
              Demo requests from nusi.in, newest first. {counts.new ?? 0} waiting to be called.
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!visible.length}
            className="inline-flex items-center gap-2 rounded-full border border-foreground/15 px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </motion.div>

        <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email or city"
              className="w-full rounded-full border border-foreground/12 bg-foreground/[0.03] py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-foreground/40 focus:border-teal-600/50 focus:outline-none focus:ring-4 focus:ring-teal-500/15"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[{ value: '', label: 'All' }, ...STATUSES].map((s) => (
              <button
                key={s.value || 'all'}
                type="button"
                onClick={() => setStatus(s.value)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm transition-colors',
                  status === s.value
                    ? 'border-teal-600/50 bg-teal-500/12 text-teal-800 dark:text-teal-200'
                    : 'border-foreground/12 text-foreground/70 hover:bg-foreground/[0.04]',
                )}
              >
                {s.label}
                <span className="ml-2 text-xs text-foreground/45">{counts[s.value || 'all'] ?? 0}</span>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div variants={fadeUp}>
          {isError ? (
            <Glass className="p-8 text-center text-sm text-foreground/65">
              Could not load leads. This page is for Sirah Digital super admins only - if that is you and
              this keeps happening, the `leads` read policy may be missing in Supabase.
            </Glass>
          ) : isLoading ? (
            <Glass className="p-8 text-center text-sm text-foreground/60">Loading leads…</Glass>
          ) : !visible.length ? (
            <Glass className="p-10 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-teal-500/12 text-teal-700 dark:text-teal-300">
                <UserPlus className="h-6 w-6" />
              </span>
              <div className="mt-4 text-sm font-semibold text-foreground">
                {leads.length ? 'No leads match this filter.' : 'No leads yet.'}
              </div>
              <p className="mx-auto mt-1 max-w-sm text-xs text-foreground/55">
                Demo requests from the landing page form appear here as soon as they are submitted.
              </p>
            </Glass>
          ) : (
            <div className="space-y-3">
              {visible.map((lead) => (
                <Glass key={lead.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-foreground">{lead.name}</span>
                        <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', STATUSES.find((s) => s.value === lead.status)?.tone ?? 'bg-foreground/[0.07] text-foreground/60')}>
                          {STATUSES.find((s) => s.value === lead.status)?.label ?? lead.status}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-foreground/70">
                        <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                          <Phone className="h-3.5 w-3.5" /> {lead.phone}
                        </a>
                        <a
                          href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 hover:text-foreground"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </a>
                        <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                          <Mail className="h-3.5 w-3.5" /> {lead.email}
                        </a>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/50">
                        <span>{formatWhen(lead.created_at)}</span>
                        {lead.city && <span>{lead.city}</span>}
                        {lead.practice_size && <span>{SIZE_LABELS[lead.practice_size] ?? lead.practice_size}</span>}
                        <span>via {formatSource(lead.source)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {STATUSES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: lead.id, value: s.value })}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-60',
                            lead.status === s.value
                              ? 'border-teal-600/50 bg-teal-500/12 text-teal-800 dark:text-teal-200'
                              : 'border-foreground/12 text-foreground/60 hover:bg-foreground/[0.04]',
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </Glass>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
