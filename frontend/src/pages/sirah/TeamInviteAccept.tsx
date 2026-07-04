import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, BrandMark, Glass, GradientOrb, fadeUp, stagger } from '@/design-system';
import { teamInvitesApi, ROLE_LABEL, type TeamInvitePreview } from '@/modules/workspace/api/tenancy';
import { supabase } from '@/integrations/supabase/client';

/**
 * Landing for a staff (team) invite token. Mirrors the client InviteAccept, but
 * staff usually already have an account — so we ask them to sign in (if needed)
 * and then accept, which grants the workspace membership + role.
 */
export default function TeamInviteAccept() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<TeamInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    teamInvitesApi.preview(token)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch((e) => { if (!cancelled) setError((e as Error).message ?? 'Invite not found'); });
    void supabase.auth.getSession().then(({ data }) => { if (!cancelled) setHasSession(!!data.session); });
    return () => { cancelled = true; };
  }, [token]);

  async function acceptNow() {
    setBusy(true);
    try {
      await teamInvitesApi.accept(token);
      toast.success('You\'ve joined the team');
      // Membership is fresh — refresh the session so the JWT picks up the new
      // workspace before landing on the dashboard.
      await supabase.auth.refreshSession().catch(() => {});
      navigate('/dashboard');
    } catch (e) {
      toast.error((e as Error).message ?? 'Could not accept invite');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Shell>
        <Glass className="border-rose-400/40 bg-rose-400/5 p-8 text-center">
          <XCircle className="mx-auto mb-3 h-8 w-8 text-rose-600 dark:text-rose-400" />
          <h1 className="text-lg font-semibold">Invite unavailable</h1>
          <p className="mt-1 text-sm text-foreground/70">{error}</p>
        </Glass>
      </Shell>
    );
  }

  if (!preview || hasSession === null) {
    return (
      <Shell>
        <Glass className="grid place-items-center p-10 text-sm text-foreground/65">
          <Loader2 className="mb-2 h-5 w-5 animate-spin" /> Loading invite…
        </Glass>
      </Shell>
    );
  }

  if (!preview.valid) {
    return (
      <Shell>
        <Glass className="border-rose-400/40 bg-rose-400/5 p-8 text-center">
          <XCircle className="mx-auto mb-3 h-8 w-8 text-rose-600 dark:text-rose-400" />
          <h1 className="text-lg font-semibold">
            {preview.reason === 'expired' ? 'This invite has expired' : `Invite ${preview.reason}`}
          </h1>
          <p className="mt-1 text-sm text-foreground/70">
            Ask {preview.invited_by_email ?? 'the workspace owner'} for a fresh link.
          </p>
        </Glass>
      </Shell>
    );
  }

  return (
    <Shell>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp} className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
            <Sparkles className="h-3 w-3" /> Team invitation
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{preview.workspace_name}</h1>
          <p className="mt-2 text-foreground/75">
            {preview.invited_by_email ?? 'The owner'} invited you to join as{' '}
            <strong className="text-foreground">{ROLE_LABEL[preview.role] ?? preview.role}</strong>.
          </p>
        </motion.div>

        <motion.div variants={fadeUp}>
          <AIGlow intensity="soft" animated={false}>
            <Glass variant="heavy" className="p-6 text-center">
              {hasSession ? (
                <div className="space-y-4">
                  <ShieldCheck className="mx-auto h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm text-foreground/75">You're signed in. One click to join.</p>
                  <button
                    type="button"
                    onClick={acceptNow}
                    disabled={busy}
                    className="w-full rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white hover:scale-[1.02] disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Accept & join'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-foreground/75">Sign in to accept this invitation.</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/auth?redirect=/team-invite/${token}`)}
                    className="w-full rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white hover:scale-[1.02]"
                  >
                    Sign in
                  </button>
                </div>
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
      <GradientOrb color="violet" size={420} position="-bottom-32 -right-20" delay={3} driftDuration={26} />
      <header className="relative z-10 border-b border-foreground/[0.06]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <BrandMark size={28} animated={false} />
          <span className="text-sm font-semibold tracking-tight">SIRAH LIFE</span>
        </div>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-md px-5 py-12">{children}</main>
    </div>
  );
}
