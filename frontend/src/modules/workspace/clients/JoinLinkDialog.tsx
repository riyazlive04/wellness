import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Copy, Link2, Loader2, RefreshCw, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass } from '@/design-system';
import { clientsApi } from '../api/clients';

interface JoinLinkDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The workspace's shareable join link. One link, not one per client: the
 * nutritionist posts it (WhatsApp / Instagram bio / QR) and anyone who opens
 * it can request a place — every request lands in the approval queue.
 *
 * Rotating issues a new token and kills the old link instantly, which is the
 * escape hatch if it ends up somewhere public.
 */
export function JoinLinkDialog({ open, onClose }: JoinLinkDialogProps) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const linkQ = useQuery({
    queryKey: ['workspace', 'join-link'],
    queryFn: () => clientsApi.getJoinLink(),
    enabled: open,
  });

  const link = linkQ.data;
  const live = !!link?.url && !link.is_expired;

  async function rotate() {
    setBusy(true);
    try {
      const next = await clientsApi.rotateJoinLink();
      qc.setQueryData(['workspace', 'join-link'], next);
      toast.success(link?.token ? 'New link issued - the old one no longer works' : 'Join link ready');
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not generate a link');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const next = await clientsApi.disableJoinLink();
      qc.setQueryData(['workspace', 'join-link'], next);
      toast.success('Join link turned off');
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not turn the link off');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link?.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy - select the text and copy manually');
    }
  }

  function close() {
    if (busy) return;
    setCopied(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" onClick={close}>
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
                <h2 className="text-lg font-semibold tracking-tight">Your join link</h2>
                <p className="mt-1 text-xs text-foreground/75 dark:text-foreground/55">
                  Share this once. Anyone who opens it can request to join - you approve each one.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="grid h-8 w-8 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-4 px-6 pb-6 pt-5">
              {linkQ.isLoading ? (
                <div className="grid place-items-center py-8 text-sm text-foreground/65">
                  <Loader2 className="mb-2 h-5 w-5 animate-spin" />
                  Loading…
                </div>
              ) : !live ? (
                <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-5 text-center">
                  <Link2 className="mx-auto mb-2 h-6 w-6 text-foreground/45" />
                  <p className="text-sm text-foreground/75">
                    {link?.is_expired
                      ? 'Your join link has expired.'
                      : 'You don\'t have a join link yet.'}
                  </p>
                  <button
                    type="button"
                    onClick={rotate}
                    disabled={busy}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate join link'}
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">
                      Share link
                    </div>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={link!.url!}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 font-mono text-xs text-foreground/85 focus:border-teal-400/60 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={copyLink}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-foreground/[0.06] px-3 py-2 text-xs font-medium hover:bg-foreground/[0.10]"
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Join my practice on NUSI - set up your account here: ${link!.url!}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-200"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Share on WhatsApp
                    </a>
                    {link!.expires_at && (
                      <span className="inline-flex items-center rounded-full bg-foreground/[0.06] px-3 py-1.5 text-xs text-foreground/65">
                        Expires {new Date(link!.expires_at).toLocaleDateString('en-IN')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.06] pt-4">
                    <p className="text-[11px] text-foreground/55">
                      Rotating kills the current link immediately.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={disable}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Turn off
                      </button>
                      <button
                        type="button"
                        onClick={rotate}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium hover:bg-foreground/[0.04] disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Rotate
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Glass>
        </AIGlow>
      </motion.div>
    </div>
  );
}
