import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Link2, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass } from '@/design-system';
import { clientsApi, type ClientInviteRow } from '../api/clients';

interface InviteClientDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful invite so the parent can refresh its list. */
  onCreated?: (invite: ClientInviteRow) => void;
}

/**
 * Issues a real client invite via POST /workspaces/me/clients/invite.
 * On success we surface the share link (copyable + WhatsApp/email pre-filled)
 * instead of pretending to "send" — email + SMS delivery wire up once
 * Resend/Twilio creds land.
 */
export function InviteClientDialog({ open, onClose, onCreated }: InviteClientDialogProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [issued, setIssued] = useState<ClientInviteRow | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const canSend = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const inviteUrl = issued
    ? `${window.location.origin}/invite/${issued.token}`
    : '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || sending) return;
    setSending(true);
    try {
      const invite = await clientsApi.invite({
        email: email.trim().toLowerCase(),
        name: name.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setIssued(invite);
      onCreated?.(invite);
      toast.success('Invite created');
    } catch (err) {
      const msg = (err as Error).message ?? 'Failed to create invite';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  function close() {
    if (sending) return;
    setEmail('');
    setName('');
    setNotes('');
    setIssued(null);
    setCopied(false);
    onClose();
  }

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy — select the text and copy manually');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      onClick={close}
    >
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
                <h2 className="text-lg font-semibold tracking-tight">
                  {issued ? 'Invite ready' : 'Invite a client'}
                </h2>
                <p className="mt-1 text-xs text-foreground/75 dark:text-foreground/55">
                  {issued
                    ? 'Share this link via WhatsApp / email. It expires in 14 days.'
                    : 'Generates a one-time, token-gated signup link tied to your workspace.'}
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

            {issued ? (
              <div className="space-y-4 px-6 pb-6 pt-5">
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                    For
                  </div>
                  <div className="mt-1 text-sm font-medium">{issued.email}</div>
                  {issued.name && <div className="text-xs text-foreground/65">{issued.name}</div>}
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">
                    Share link
                  </div>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
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
                    href={`https://wa.me/?text=${encodeURIComponent(`You've been invited to NUSI. Set up your account here: ${inviteUrl}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-200"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Open in WhatsApp
                  </a>
                  <a
                    href={`mailto:${issued.email}?subject=${encodeURIComponent('Your NUSI invite')}&body=${encodeURIComponent(`Hi${issued.name ? ' ' + issued.name : ''},\n\nYou've been invited to your NUSI client portal. Set up your account here:\n${inviteUrl}\n\nThis link expires in 14 days.`)}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-500/25 dark:text-sky-200"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Open email draft
                  </a>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97]"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6 pt-5">
                <Field
                  label="Client's email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="priya@example.com"
                  autoFocus
                />
                <Field
                  label={<>Client's name <span className="text-foreground/30">(optional)</span></>}
                  value={name}
                  onChange={setName}
                  placeholder="Priya Sharma"
                />
                <Field
                  label={<>Internal note <span className="text-foreground/30">(optional)</span></>}
                  value={notes}
                  onChange={setNotes}
                  placeholder="Referred by Dr. Mehta"
                />

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={sending}
                    className="rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canSend || sending}
                    className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02] cta-glow active:scale-[0.97] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Generate invite link
                        <Send className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </Glass>
        </AIGlow>
      </motion.div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', autoFocus,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/45 focus:border-teal-400/60 focus:bg-foreground/[0.06] focus:outline-none"
      />
    </label>
  );
}