import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Mail, MessageCircle, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass } from '@/design-system';
import type { InvitePayload } from './types';

interface InviteClientDialogProps {
  open: boolean;
  onClose: () => void;
  onInvite: (payload: InvitePayload) => Promise<void> | void;
}

const PROGRAMS = [
  { id: 'pcos',     name: 'PCOS Reset (12 weeks)' },
  { id: 'wl',       name: 'Weight Loss (12 weeks)' },
  { id: 'diabetes', name: 'Diabetes Care (12 weeks)' },
  { id: 'muscle',   name: 'Muscle Gain (12 weeks)' },
  { id: 'gut',      name: 'Gut Health (8 weeks)' },
  { id: 'cardiac',  name: 'Cardiac Care (16 weeks)' },
];

export function InviteClientDialog({ open, onClose, onInvite }: InviteClientDialogProps) {
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [programId, setProgramId] = useState<string>('');
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const canSend = name.trim().length >= 2 && contact.trim().length >= 5;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || sending) return;
    setSending(true);
    try {
      await onInvite({ name: name.trim(), contact: contact.trim(), channel, programId: programId || undefined });
      toast.success(`Invite sent to ${name} via ${channel === 'whatsapp' ? 'WhatsApp' : 'email'}.`);
      // Reset & close
      setName('');
      setContact('');
      setProgramId('');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to send invite. Please try again.');
    } finally {
      setSending(false);
    }
  }

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
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Invite a client</h2>
                <p className="mt-1 text-xs text-white/55">
                  They'll receive a personalized link to set up their wellness profile.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6 pt-5">
              {/* Channel */}
              <div className="flex rounded-full bg-white/[0.04] p-1">
                <ChannelButton
                  active={channel === 'whatsapp'}
                  onClick={() => setChannel('whatsapp')}
                  icon={MessageCircle}
                  label="WhatsApp"
                />
                <ChannelButton
                  active={channel === 'email'}
                  onClick={() => setChannel('email')}
                  icon={Mail}
                  label="Email"
                />
              </div>

              <Field
                label="Client's name"
                value={name}
                onChange={setName}
                placeholder="Priya Sharma"
                autoFocus
              />

              <Field
                label={channel === 'whatsapp' ? 'Phone (with country code)' : 'Email'}
                type={channel === 'whatsapp' ? 'tel' : 'email'}
                value={contact}
                onChange={setContact}
                placeholder={channel === 'whatsapp' ? '+91 98 76 54 32 10' : 'priya@example.com'}
              />

              <label className="block">
                <div className="mb-1.5 text-xs font-medium text-white/60">
                  Pre-assign a program <span className="text-white/30">(optional)</span>
                </div>
                <select
                  value={programId}
                  onChange={(e) => setProgramId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white focus:border-violet-400/60 focus:bg-white/[0.06] focus:outline-none"
                >
                  <option value="" className="bg-[#1B1E25]">None — I'll assign later</option>
                  {PROGRAMS.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#1B1E25]">
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={sending}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.04] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSend || sending}
                  className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Send invite
                      <Send className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
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

function ChannelButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-white'
          : 'text-white/50 hover:text-white/80'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
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
      <div className="mb-1.5 text-xs font-medium text-white/60">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-violet-400/60 focus:bg-white/[0.06] focus:outline-none"
      />
    </label>
  );
}
