import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Send, Users, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass } from '@/design-system';
import { MOCK_CLIENTS } from '@/modules/workspace/clients/data/mockClients';
import { MESSAGE_TEMPLATES } from '../data/templates';
import { cn } from '@/lib/utils';
import type { BulkAudience } from '../types';

interface BulkMessageDialogProps {
  open: boolean;
  onClose: () => void;
}

type AudienceKey = 'all' | 'active' | 'at_risk' | 'paused';

export function BulkMessageDialog({ open, onClose }: BulkMessageDialogProps) {
  const [audience, setAudience] = useState<AudienceKey>('active');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const recipients = useMemo(() => {
    return MOCK_CLIENTS.filter((c) => {
      if (audience === 'all') return c.status !== 'pending_invite';
      return c.status === audience;
    });
  }, [audience]);

  if (!open) return null;

  function pickTemplate(templateBody: string) {
    // For bulk: leave {name} as variable since per-recipient substitution would happen server-side
    setBody(templateBody);
  }

  async function handleSend() {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      toast.success(
        `Queued ${recipients.length} ${recipients.length === 1 ? 'message' : 'messages'} — variables resolved per recipient.`,
      );
      setBody('');
      onClose();
    } finally {
      setSending(false);
    }
  }

  // Build the typed audience payload for the future backend call
  const audienceDescriptor: BulkAudience =
    audience === 'all' ? { kind: 'all' } : { kind: 'status', status: audience };
  void audienceDescriptor; // kept for future backend wiring

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-2xl p-4 md:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <AIGlow intensity="soft" animated={false}>
          <Glass variant="heavy" className="overflow-hidden rounded-2xl">
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Bulk message</h2>
                <p className="mt-1 text-xs text-foreground/75 dark:text-foreground/55">
                  Send a single message to a group of clients. Variables like {'{name}'} are resolved per
                  recipient before sending.
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
            </div>

            <div className="space-y-5 p-6">
              {/* Audience */}
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                  Audience
                </div>
                <div className="flex flex-wrap gap-2">
                  <AudiencePill label="All clients"  count={MOCK_CLIENTS.filter((c) => c.status !== 'pending_invite').length} active={audience === 'all'} onClick={() => setAudience('all')} />
                  <AudiencePill label="Active"       count={MOCK_CLIENTS.filter((c) => c.status === 'active').length}        active={audience === 'active'} onClick={() => setAudience('active')} tone="sage" />
                  <AudiencePill label="At risk"      count={MOCK_CLIENTS.filter((c) => c.status === 'at_risk').length}       active={audience === 'at_risk'} onClick={() => setAudience('at_risk')} tone="coral" />
                  <AudiencePill label="Paused"       count={MOCK_CLIENTS.filter((c) => c.status === 'paused').length}        active={audience === 'paused'} onClick={() => setAudience('paused')} tone="sand" />
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-foreground/75 dark:text-foreground/60">
                  <Users className="h-3 w-3" />
                  Will send to {recipients.length} {recipients.length === 1 ? 'recipient' : 'recipients'}
                </div>
              </div>

              {/* Template picker */}
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                  Start from a template
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MESSAGE_TEMPLATES.slice(0, 6).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickTemplate(t.body)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[11px] text-foreground/80 transition-colors hover:bg-foreground/[0.06]"
                    >
                      <Sparkles className="h-3 w-3 text-teal-700 dark:text-teal-300" />
                      {t.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message body */}
              <label className="block">
                <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">Message</div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder="Hi {name}, just a quick check-in…"
                  className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-foreground/75 dark:text-foreground/60 focus:border-teal-400/60 focus:bg-foreground/[0.06] focus:outline-none"
                />
                <div className="mt-1 text-[11px] text-foreground/35">
                  Available variables: <code className="text-foreground/75 dark:text-foreground/55">{'{name}'}</code> ·{' '}
                  <code className="text-foreground/75 dark:text-foreground/55">{'{program}'}</code> ·{' '}
                  <code className="text-foreground/75 dark:text-foreground/55">{'{week}'}</code>
                </div>
              </label>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={sending}
                  className="rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!body.trim() || sending || recipients.length === 0}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-foreground transition-transform duration-200 hover:scale-[1.02] cta-glow active:scale-[0.97] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Send to {recipients.length}
                      <Send className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </Glass>
        </AIGlow>
      </motion.div>
    </div>
  );
}

function AudiencePill({
  label,
  count,
  active,
  onClick,
  tone = 'indigo',
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'indigo' | 'sage' | 'coral' | 'sand';
}) {
  const activeStyle = {
    indigo: 'bg-teal-400/15 border-teal-400/50 text-foreground',
    sage:   'bg-emerald-400/15 border-emerald-400/50 text-foreground',
    coral:  'bg-rose-400/15 border-rose-400/50 text-foreground',
    sand:   'bg-amber-300/15 border-amber-300/50 text-foreground',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
        active ? activeStyle : 'border-foreground/10 bg-foreground/[0.03] text-foreground/80 dark:text-foreground/65 hover:bg-foreground/[0.06]',
      )}
    >
      <span>{label}</span>
      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-foreground/15 text-foreground' : 'bg-foreground/[0.04] text-foreground/75 dark:text-foreground/60')}>
        {count}
      </span>
    </button>
  );
}
