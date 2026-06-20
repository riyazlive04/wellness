import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, Search, X } from 'lucide-react';

import { AIGlow, Glass } from '@/design-system';
import { clientsApi } from '../../api/clients';
import { programEngineApi } from '../../api/programEngine';

export interface TargetChoice {
  id: string;
  label: string;
  sub?: string;
}

interface ReportTargetDialogProps {
  open: boolean;
  kind: 'client' | 'program';
  templateName: string;
  onClose: () => void;
  onPick: (choice: TargetChoice) => void;
}

/** Lets the owner choose which client / program a report is generated for. */
export function ReportTargetDialog({ open, kind, templateName, onClose, onPick }: ReportTargetDialogProps) {
  const [q, setQ] = useState('');

  const clientsQ = useQuery({
    queryKey: ['reports-target-clients'],
    queryFn: () => clientsApi.list({ limit: 200 }),
    enabled: open && kind === 'client',
  });
  const programsQ = useQuery({
    queryKey: ['reports-target-programs'],
    queryFn: () => programEngineApi.listTemplates(),
    enabled: open && kind === 'program',
  });

  const choices: TargetChoice[] = useMemo(() => {
    if (kind === 'client') {
      return (clientsQ.data?.items ?? []).map((c) => ({
        id: c.id,
        label: c.display_name || c.name,
        sub: c.email || c.program_type || undefined,
      }));
    }
    return (programsQ.data ?? []).map((p) => ({
      id: p.id,
      label: p.name,
      sub: `${p.category} · ${p.assigned_count ?? 0} enrolled`,
    }));
  }, [kind, clientsQ.data, programsQ.data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return choices;
    return choices.filter((c) => c.label.toLowerCase().includes(term) || c.sub?.toLowerCase().includes(term));
  }, [choices, q]);

  const loading = kind === 'client' ? clientsQ.isLoading : programsQ.isLoading;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-sm md:items-center" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg p-4 md:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <AIGlow intensity="soft" animated={false}>
          <Glass variant="heavy" className="overflow-hidden rounded-2xl">
            <header className="flex items-start justify-between px-6 pt-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Choose a {kind}</h2>
                <p className="mt-1 text-xs text-foreground/75 dark:text-foreground/55">
                  Generate “{templateName}” for the selected {kind}.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="px-6 pb-6 pt-4">
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={`Search ${kind}s…`}
                  className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/45 focus:border-violet-400/60 focus:outline-none"
                />
              </div>

              <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-foreground/[0.06]">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-foreground/60">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-12 text-center text-sm text-foreground/55">
                    No {kind}s found{q ? ` for “${q}”` : ''}.
                  </div>
                ) : (
                  <ul>
                    {filtered.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onPick(c)}
                          className="group flex w-full items-center justify-between gap-3 border-b border-foreground/[0.04] px-4 py-3 text-left last:border-0 hover:bg-foreground/[0.04]"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">{c.label}</div>
                            {c.sub && <div className="truncate text-[11px] text-foreground/60">{c.sub}</div>}
                          </div>
                          <ArrowRight className="h-4 w-4 flex-shrink-0 text-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground/60" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Glass>
        </AIGlow>
      </motion.div>
    </div>
  );
}
