import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Loader2, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, BrandMark, Glass, GradientOrb, Wordmark, fadeUp, stagger } from '@/design-system';
import { clientsApi, type JoinPreview } from '@/modules/workspace/api/clients';
import { supabase } from '@/integrations/supabase/client';

/**
 * Public landing for a workspace join link (/join/:token).
 *
 * Three states:
 *   1. Invalid / expired token      → error
 *   2. Valid + caller not signed in → signup form (name / email / password)
 *   3. Valid + caller signed in     → one-click "request to join"
 *
 * After requesting, the owner has to approve, so we land on /portal/pending —
 * except for pre-imported emails, which the backend auto-approves and which go
 * straight to onboarding.
 */
export default function Join() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const p = await clientsApi.previewJoin(token);
        if (!cancelled) setPreview(p);
      } catch (err) {
        if (!cancelled) setPreviewError((err as Error).message ?? 'This link is not valid');
      }
    })();

    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setHasSession(!!data.session);
    });

    return () => { cancelled = true; };
  }, [token]);

  /** Send the request and route by outcome. Shared by both entry paths. */
  async function submitRequest(displayName?: string) {
    const res = await clientsApi.requestJoin(token, displayName);
    // requestJoin just granted the 'client' role. Drop any scope the guards may
    // have already cached (as 'unaffiliated') and refetch, so RequireClient on
    // the portal routes below sees tier 'client' — otherwise the stale scope
    // bounces the new joiner to the owner onboarding wizard (→ billing).
    await queryClient.invalidateQueries({ queryKey: ['scope'] });
    if (res.status === 'active') {
      toast.success('You\'re in - let\'s set up your profile');
      navigate('/portal/onboarding');
    } else {
      toast.success('Request sent');
      navigate('/portal/pending');
    }
  }

  async function requestNow() {
    setBusy(true);
    try {
      await submitRequest();
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not send request');
    } finally {
      setBusy(false);
    }
  }

  async function signUpAndRequest(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      // Sign up; if they already have an account, fall through to sign-in so a
      // returning client isn't dead-ended on "already registered".
      const { error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { full_name: name.trim() || undefined } },
      });
      if (signUpErr && !/already registered|already exists/i.test(signUpErr.message)) {
        throw signUpErr;
      }
      // With email confirmation on, sign-up leaves no session — sign in.
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInErr) throw signInErr;
      }
      await submitRequest(name.trim() || undefined);
    } catch (err) {
      toast.error((err as Error).message ?? 'Sign-up failed');
    } finally {
      setBusy(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────
  if (previewError) {
    return (
      <Shell>
        <Glass className="border-rose-400/40 bg-rose-400/5 p-8 text-center">
          <XCircle className="mx-auto mb-3 h-8 w-8 text-rose-600 dark:text-rose-400" />
          <h1 className="text-lg font-semibold">Link unavailable</h1>
          <p className="mt-1 text-sm text-foreground/70">{previewError}</p>
          <p className="mt-3 text-xs text-foreground/55">
            Ask your nutritionist for a fresh link.
          </p>
        </Glass>
      </Shell>
    );
  }

  if (!preview || hasSession === null) {
    return (
      <Shell>
        <Glass className="grid place-items-center p-10 text-sm text-foreground/65">
          <Loader2 className="mb-2 h-5 w-5 animate-spin" />
          Loading…
        </Glass>
      </Shell>
    );
  }

  return (
    <Shell>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp} className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
            <Sparkles className="h-3 w-3" />
            Join the practice
          </span>
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight">
            {preview.workspace_name}
          </h1>
          <p className="mt-2 text-pretty text-foreground/75">
            Create your account to request a place on {preview.workspace_name}'s client roster.
          </p>
        </motion.div>

        <motion.div variants={fadeUp}>
          <AIGlow intensity="soft" animated={false}>
            <Glass variant="heavy" className="p-6">
              {hasSession ? (
                <div className="space-y-4 text-center">
                  <ShieldCheck className="mx-auto h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm text-foreground/75">
                    You're signed in. Send your request to {preview.workspace_name}.
                  </p>
                  <button
                    type="button"
                    onClick={requestNow}
                    disabled={busy}
                    className="w-full rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Request to join'}
                  </button>
                </div>
              ) : (
                <form onSubmit={signUpAndRequest} className="space-y-4">
                  <Field label="Your name" value={name} onChange={setName} placeholder="Priya Sharma" autoFocus />
                  <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="priya@example.com" />
                  <Field
                    label="Choose a password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="8+ characters"
                  />
                  <button
                    type="submit"
                    disabled={busy || !name.trim() || !email.trim() || !password}
                    className="w-full rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  >
                    {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Create account & request'}
                  </button>
                  <p className="text-center text-[11px] text-foreground/55">
                    Already have an account?{' '}
                    <button type="button" onClick={() => navigate('/auth')} className="underline hover:text-foreground">
                      Sign in
                    </button>{' '}
                    first, then reopen this link.
                  </p>
                </form>
              )}
            </Glass>
          </AIGlow>
        </motion.div>

        <p className="text-center text-[11px] text-foreground/55">
          Your nutritionist reviews every request before you get access.
        </p>
      </motion.div>
    </Shell>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', autoFocus,
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
      <div className="mb-1.5 text-xs font-medium text-foreground/75">{label}</div>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // Orbs live in their own fixed, clipped layer — `overflow-hidden` on the
    // page root would also clip vertically and cut off content on short
    // viewports (it did exactly that on the onboarding wizard).
    <div className="relative min-h-screen bg-canvas text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <GradientOrb color="magenta" size={520} position="-top-32 -left-20" />
        <GradientOrb color="violet"  size={420} position="-bottom-32 -right-20" delay={3} driftDuration={26} />
      </div>
      <header className="relative z-10 border-b border-foreground/[0.06]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <BrandMark size={28} animated={false} />
          <Wordmark className="text-sm" />
        </div>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-md px-5 py-12">
        {children}
      </main>
    </div>
  );
}
