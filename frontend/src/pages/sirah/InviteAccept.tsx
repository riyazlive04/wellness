import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Mail, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, BrandMark, Glass, GradientOrb, Wordmark, fadeUp, stagger } from '@/design-system';
import { clientsApi, type InvitePreview } from '@/modules/workspace/api/clients';
import { supabase } from '@/integrations/supabase/client';

/**
 * Public landing for a client invite token.
 *
 * Three states:
 *   1. Invalid / expired / revoked  → show error
 *   2. Valid + caller not signed in → show signup form (email pre-filled, locked)
 *   3. Valid + caller signed in     → accept button
 * After accept, navigate to /portal.
 */
export default function InviteAccept() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');

  // Load invite preview + session state on mount
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const p = await clientsApi.previewInvite(token);
        if (cancelled) return;
        setPreview(p);
      } catch (err) {
        if (cancelled) return;
        setPreviewError((err as Error).message ?? 'Invite not found');
      }
    }
    void init();

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setHasSession(!!data.session);
    });

    return () => { cancelled = true; };
  }, [token]);

  async function acceptNow() {
    setBusy(true);
    try {
      await clientsApi.acceptInvite(token);
      toast.success('Welcome to NUSI');
      navigate('/portal');
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not accept invite');
    } finally {
      setBusy(false);
    }
  }

  async function signUpAndAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      // Try sign-up first; if the user already exists, fall back to sign-in.
      const { error: signUpErr } = await supabase.auth.signUp({
        email: preview.email,
        password,
      });
      if (signUpErr && !/already registered|already exists/i.test(signUpErr.message)) {
        throw signUpErr;
      }
      // If sign-up happened with email confirmation on, supabase may have no
      // session yet — sign in directly with the same credentials.
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: preview.email,
          password,
        });
        if (signInErr) throw signInErr;
      }
      await clientsApi.acceptInvite(token);
      toast.success('Account ready');
      navigate('/portal');
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
          <h1 className="text-lg font-semibold">Invite unavailable</h1>
          <p className="mt-1 text-sm text-foreground/70">{previewError}</p>
        </Glass>
      </Shell>
    );
  }

  if (!preview || hasSession === null) {
    return (
      <Shell>
        <Glass className="grid place-items-center p-10 text-sm text-foreground/65">
          <Loader2 className="mb-2 h-5 w-5 animate-spin" />
          Loading invite…
        </Glass>
      </Shell>
    );
  }

  if (preview.is_expired || preview.status !== 'pending') {
    return (
      <Shell>
        <Glass className="border-rose-400/40 bg-rose-400/5 p-8 text-center">
          <XCircle className="mx-auto mb-3 h-8 w-8 text-rose-600 dark:text-rose-400" />
          <h1 className="text-lg font-semibold">
            {preview.is_expired ? 'This invite has expired' : `Invite ${preview.status}`}
          </h1>
          <p className="mt-1 text-sm text-foreground/70">
            Ask {preview.inviter_email ?? 'your nutritionist'} for a fresh link.
          </p>
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
            You've been invited
          </span>
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight">
            {preview.workspace_name}
          </h1>
          <p className="mt-2 text-pretty text-foreground/75">
            {preview.inviter_email ?? 'Your nutritionist'} has invited{' '}
            <strong className="text-foreground">{preview.email}</strong> to a NUSI client portal.
          </p>
        </motion.div>

        <motion.div variants={fadeUp}>
          <AIGlow intensity="soft" animated={false}>
            <Glass variant="heavy" className="p-6">
              {hasSession ? (
                <div className="space-y-4 text-center">
                  <ShieldCheck className="mx-auto h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm text-foreground/75">
                    You're signed in. One click to join {preview.workspace_name}.
                  </p>
                  <button
                    type="button"
                    onClick={acceptNow}
                    disabled={busy}
                    className="w-full rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Accept invite'}
                  </button>
                </div>
              ) : (
                <form onSubmit={signUpAndAccept} className="space-y-4">
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-foreground/75">Email</div>
                    <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground/85">
                      <Mail className="h-4 w-4 text-foreground/45" />
                      <span className="flex-1 truncate">{preview.email}</span>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">locked</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-foreground/75">Choose a password</div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="8+ characters"
                      autoFocus
                      className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Create account & continue'}
                  </button>
                  <p className="text-center text-[11px] text-foreground/55">
                    Already have an account?{' '}
                    <button type="button" onClick={() => navigate('/auth')} className="underline hover:text-foreground">
                      Sign in
                    </button>{' '}
                    first and reopen this link.
                  </p>
                </form>
              )}
            </Glass>
          </AIGlow>
        </motion.div>

        <p className="text-center text-[11px] text-foreground/55">
          Invite expires {new Date(preview.expires_at).toLocaleDateString('en-IN')}.
        </p>
      </motion.div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-foreground">
      <GradientOrb color="magenta" size={520} position="-top-32 -left-20" />
      <GradientOrb color="violet"  size={420} position="-bottom-32 -right-20" delay={3} driftDuration={26} />
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