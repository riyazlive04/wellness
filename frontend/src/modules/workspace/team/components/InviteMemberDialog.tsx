import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Send, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass } from '@/design-system';
import { ROLE_META } from '../helpers';
import type { MemberRole } from '../types';

interface InviteMemberDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the invite payload (mock — backend wires later) */
  onInvite: (p: { name: string; email: string; role: MemberRole }) => Promise<void>;
  /** Seats already used (for upgrade nudge) */
  seatsUsed: number;
  seatsTotal: number | null;
}

export function InviteMemberDialog({
  open,
  onClose,
  onInvite,
  seatsUsed,
  seatsTotal,
}: InviteMemberDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('coach');
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const canInvite =
    name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && (seatsTotal === null || seatsUsed < seatsTotal);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canInvite || sending) return;
    setSending(true);
    try {
      await onInvite({ name: name.trim(), email: email.trim(), role });
      toast.success(`Invite sent to ${email}.`);
      setName('');
      setEmail('');
      setRole('coach');
      onClose();
    } catch {
      toast.error('Could not send invite. Try again.');
    } finally {
      setSending(false);
    }
  }

  const atCap = seatsTotal !== null && seatsUsed >= seatsTotal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center"
      onClick={onClose}
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
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-violet-200">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Invite a team member</h2>
                  <p className="mt-1 text-xs text-foreground/55">
                    They'll get an email + WhatsApp link to set up their SIRAH workspace access.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4 px-6 pb-6 pt-5">
              {atCap && (
                <div className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-3 text-xs text-amber-100">
                  You've hit your plan's seat limit ({seatsTotal} of {seatsTotal}). Upgrade to add more
                  team members.
                </div>
              )}

              <Field label="Name" value={name} onChange={setName} placeholder="Sneha Bose" autoFocus />
              <Field label="Email" value={email} onChange={setEmail} placeholder="sneha@example.com" type="email" />

              {/* Role picker */}
              <div>
                <div className="mb-2 text-xs font-medium text-foreground/60">Role</div>
                <div className="space-y-2">
                  {(['manager', 'coach'] as MemberRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                        role === r
                          ? 'border-violet-400/50 bg-violet-400/[0.06]'
                          : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.04]'
                      }`}
                    >
                      <div
                        className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 ${
                          role === r ? 'border-violet-400 bg-violet-400/40' : 'border-foreground/25'
                        }`}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">{ROLE_META[r].label}</div>
                        <div className="mt-0.5 text-[11px] text-foreground/55">{ROLE_META[r].description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

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
                  type="submit"
                  disabled={!canInvite || sending}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2 text-sm font-medium text-foreground transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <>
                      Send invite
                      <Send className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </Glass>
        </AIGlow>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/60">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/60 focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
      />
    </label>
  );
}
