import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { supabase } from '@/integrations/supabase/client';
import { BrandMark, Glass, GradientOrb, AIGlow, fadeUp, stagger } from '@/design-system';
import { ThemeToggle } from '@/modules/workspace/ThemeToggle';

type Phase = 'checking' | 'ready' | 'invalid';

/**
 * Password recovery landing page.
 *
 * The email's reset link points here. Supabase's `detectSessionInUrl` (on by
 * default) parses the token in the URL and establishes a short-lived recovery
 * session, firing a PASSWORD_RECOVERY auth event. Once we see that session the
 * form unlocks and `updateUser({ password })` sets the new password. We then
 * sign the user out and bounce to /auth so they log in fresh with it.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const resolved = useRef(false);

  useEffect(() => {
    const markReady = () => {
      resolved.current = true;
      setPhase('ready');
    };

    // The recovery session may land before OR after this listener attaches, so
    // we cover both: subscribe to the event AND check the current session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) markReady();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    // If no session shows up shortly, the link was missing/expired/used.
    const t = setTimeout(() => {
      if (!resolved.current) setPhase('invalid');
    }, 2500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = z.string().min(8, 'Use at least 8 characters').safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? 'Password too short');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Password updated. Please sign in with your new password.');
      await supabase.auth.signOut();
      navigate('/auth');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-6 text-foreground">
      <GradientOrb color="blue" size={560} position="-top-40 -left-32" />
      <GradientOrb color="magenta" size={460} position="-bottom-40 -right-20" delay={2} driftDuration={22} />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle className="flex" />
      </div>

      <motion.div
        variants={stagger(0.08, 0.06)}
        initial="initial"
        animate="animate"
        className="relative z-10 w-full max-w-md"
      >
        <motion.div variants={fadeUp} className="mb-8 flex flex-col items-center">
          <Link to="/" className="flex items-center gap-3">
            <BrandMark size={44} />
            <div className="flex flex-col leading-none">
              <span className="text-lg font-semibold tracking-tight">SIRAH LIFE</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                by Sirah Digital
              </span>
            </div>
          </Link>
        </motion.div>

        <motion.div variants={fadeUp}>
          <AIGlow intensity="soft" animated={false} className="rounded-3xl">
            <Glass variant="heavy" className="rounded-3xl p-7">
              <div className="mb-6 flex items-start gap-3">
                <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15 text-violet-700 dark:text-violet-200">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
                  <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">
                    Choose a strong password you don't use elsewhere.
                  </p>
                </div>
              </div>

              {phase === 'checking' && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying your reset link…
                </div>
              )}

              {phase === 'invalid' && (
                <div className="space-y-4 py-4 text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-600 ring-1 ring-rose-400/30 dark:text-rose-300">
                    <ShieldAlert className="h-6 w-6" strokeWidth={1.6} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold tracking-tight">Reset link invalid or expired</h3>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/65">
                      Reset links work once and expire after 60 minutes. Request a fresh one from the
                      sign-in page.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/auth')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.01]"
                  >
                    Back to sign in
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {phase === 'ready' && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <PwField
                    label="New password"
                    value={password}
                    onChange={setPassword}
                    show={show}
                    onToggle={() => setShow((s) => !s)}
                    placeholder="Min 8 characters"
                    autoFocus
                  />
                  <PwField
                    label="Confirm new password"
                    value={confirm}
                    onChange={setConfirm}
                    show={show}
                    onToggle={() => setShow((s) => !s)}
                    placeholder="Re-enter password"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-3 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Update password
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </Glass>
          </AIGlow>
        </motion.div>
      </motion.div>
    </div>
  );
}

function PwField({
  label, value, onChange, show, onToggle, placeholder, autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">{label}</div>
      <div className="flex items-center rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 transition-all duration-200 focus-within:border-violet-400/70 focus-within:bg-foreground/[0.06] focus-within:shadow-[0_0_0_4px_rgba(139,92,246,0.10)]">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/45 focus:outline-none"
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          className="text-foreground/55 hover:text-foreground/80"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}
