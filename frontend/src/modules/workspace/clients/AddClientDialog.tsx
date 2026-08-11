import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { UserPlus, X, Loader2, RefreshCw, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { clientsApi } from '@/modules/workspace/api/clients';

/** A readable random password (no ambiguous chars) the owner can share. */
function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[arr[i] % chars.length];
  return out;
}

/**
 * Add a client directly with a login — like adding a staff member. The backend
 * creates the account with the email pre-confirmed, so NO confirmation email is
 * sent (Supabase's email rate limit is never hit). The owner shares the
 * credentials shown on success; the client can sign in immediately.
 */
export function AddClientDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => randomPassword());
  const [phone, setPhone] = useState('');
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      clientsApi.createClient({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workspace', 'clients'] });
      setDone({ email: email.trim().toLowerCase(), password });
      toast.success('Client added — share their login.');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not add the client.'),
  });

  function submit() {
    if (!name.trim()) return toast.error("Enter the client's name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return toast.error('Enter a valid email address');
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    createMut.mutate();
  }

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(`${what} copied`),
      () => toast.error('Could not copy'),
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <h2 className="text-sm font-semibold">{done ? 'Client added' : 'Add a client'}</h2>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {done ? (
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-start gap-2.5 rounded-xl border border-teal-400/25 bg-teal-400/[0.06] p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
              <p className="text-foreground/80">
                <b>{name.trim()}</b> can sign in now. Share these credentials — the password won't be shown again.
              </p>
            </div>
            <CredRow label="Email" value={done.email} onCopy={() => copy(done.email, 'Email')} />
            <CredRow label="Password" value={done.password} mono onCopy={() => copy(done.password, 'Password')} />
            <button
              type="button"
              onClick={() => copy(`Sign in at nusi.in\nEmail: ${done.email}\nPassword: ${done.password}`, 'Login details')}
              className="w-full rounded-xl border border-foreground/12 px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-foreground/[0.04]"
            >
              Copy all login details
            </button>
            <button
              type="button" onClick={onClose}
              className="w-full rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2.5 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3.5 px-5 py-5">
            <Field label="Name">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Aakash Kumar" className={inputCls} />
            </Field>
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" className={inputCls} />
            </Field>
            <Field label="Temporary password">
              <div className="flex gap-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} font-mono`} />
                <button
                  type="button" onClick={() => setPassword(randomPassword())} title="Generate a new password"
                  className="grid w-11 shrink-0 place-items-center rounded-xl border border-foreground/10 text-foreground/60 hover:bg-foreground/[0.05] hover:text-foreground"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </Field>
            <Field label="Phone (optional)">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
            </Field>

            <p className="text-xs leading-relaxed text-foreground/50">
              No email is sent — you share the login with the client yourself. They can change the password after signing in.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button" onClick={onClose} disabled={createMut.isPending}
                className="rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button" onClick={submit} disabled={createMut.isPending || !name.trim() || !email.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Add client
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

const inputCls =
  'w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/70">{label}</div>
      {children}
    </label>
  );
}

function CredRow({ label, value, mono, onCopy }: { label: string; value: string; mono?: boolean; onCopy: () => void }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/45">{label}</div>
      <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2">
        <span className={`min-w-0 flex-1 truncate text-sm ${mono ? 'font-mono' : ''}`}>{value}</span>
        <button type="button" onClick={onCopy} aria-label={`Copy ${label}`} className="shrink-0 text-foreground/50 hover:text-foreground">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
