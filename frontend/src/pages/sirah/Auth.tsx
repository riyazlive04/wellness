import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MailCheck,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/lib/api';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';
import {
  BrandMark,
  Glass,
  GradientOrb,
  AIGlow,
  fadeUp,
  stagger,
  Wordmark,
} from '@/design-system';
import { LiveAuthVisual } from './auth/LiveAuthVisual';
import { SocialProof } from './auth/SocialProof';
import { ThemeToggle } from '@/modules/workspace/ThemeToggle';

interface ScopeAfterSignIn {
  tier: 'super_admin' | 'workspace' | 'client' | 'unaffiliated';
}

/**
 * Where to send the user immediately after sign-in. Matches the
 * TIER_HOME map in <RequireRole/>, so the redirect lands on the route
 * the user would also be bounced to by the guard.
 *
 * Pass the token explicitly so we don't race on supabase storage propagation
 * (the shared api client reads via supabase.auth.getSession() which is
 * sometimes stale for ~tens of ms right after signInWithPassword resolves —
 * resulting in the /me/scope request firing without auth and falling back
 * to /dashboard even for super admins).
 */
async function resolveHomeForUser(accessToken: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/me/scope`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error('[auth] /me/scope failed', res.status, await res.text().catch(() => ''));
      return '/onboarding';
    }
    const json = (await res.json()) as { data: ScopeAfterSignIn };
    switch (json.data.tier) {
      case 'super_admin':  return '/admin';
      case 'workspace':    return '/dashboard';
      case 'client':       return '/portal';
      case 'unaffiliated': return '/onboarding';
    }
  } catch (err) {
    // Backend unreachable / not booted — the safer fallback is /onboarding
    // (workspace tier requires a real workspace to make sense).
    if (!(err instanceof ApiError)) console.error('[auth] /me/scope failed', err);
  }
  return '/onboarding';
}

type Mode = 'signin' | 'signup';

const signinSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'At least 6 characters'),
});

const signupSchema = z.object({
  name: z.string().min(2, 'Tell us your name'),
  email: z.string().email('Invalid email'),
  phone: z.string().min(7, 'Looks too short'),
  password: z.string().min(8, 'At least 8 characters'),
});

export default function SirahAuth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Both auth paths read from the same controlled email input. Password is
  // still uncontrolled (FormData on submit) since only handleSignIn needs it.
  const [email, setEmail] = useState('');
  // magicSent flips on after a successful OTP request so the form can swap
  // to the "check your inbox" confirmation panel.
  const [magicSent, setMagicSent] = useState<string | null>(null);

  // Form-card tilt. Lower amplitude than feature cards (±3° vs ±6°) because
  // the auth form has dense text content — strong tilt would hurt legibility.
  const cardRef = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [3, -3]), {
    stiffness: 120, damping: 22, mass: 0.6,
  });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-3, 3]), {
    stiffness: 120, damping: 22, mass: 0.6,
  });

  function handleCardMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  }
  function handleCardMouseLeave() {
    mx.set(0);
    my.set(0);
  }

  // Called from the secondary "Email me a sign-in link" button. Reads the
  // email from controlled state (same field the password form uses), so the
  // user types once and can choose either path.
  async function handleSendMagicLink() {
    setErrors({});
    const trimmed = email.trim().toLowerCase();
    const parsed = z.string().email('Invalid email').safeParse(trimmed);
    if (!parsed.success) {
      setErrors({ email: parsed.error.errors[0]?.message ?? 'Invalid email' });
      return;
    }

    setLoading(true);
    try {
      // shouldCreateUser:false — sign-in only signs in existing accounts. If
      // the email isn't in auth.users yet, Supabase returns an error that we
      // funnel into a "Create a workspace instead" prompt.
      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          shouldCreateUser: false,
        },
      });
      if (error) {
        const msg = error.message;
        if (/not found|doesn't exist|user not allowed|signups? not allowed/i.test(msg)) {
          toast.error("No account for that email", {
            description: 'Switch to "Create workspace" to sign up.',
          });
        } else {
          toast.error(msg);
        }
      } else {
        setMagicSent(parsed.data);
        toast.success('Sign-in link sent');
      }
    } finally {
      setLoading(false);
    }
  }

  // "Forgot password?" — emails a recovery link that lands on /reset-password
  // where the user sets a new password. Reads the same controlled email field.
  async function handleForgotPassword() {
    setErrors({});
    const trimmed = email.trim().toLowerCase();
    const parsed = z.string().email('Invalid email').safeParse(trimmed);
    if (!parsed.success) {
      setErrors({ email: 'Enter your email above first, then tap "Forgot password?"' });
      toast.error('Enter your email first', {
        description: 'Type the email for your account, then tap "Forgot password?" again.',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Supabase returns success even for unknown emails (anti-enumeration), so
      // we always show the same reassuring message.
      if (error && !/rate|too many/i.test(error.message)) {
        toast.error(error.message);
      } else if (error) {
        toast.error('Too many attempts - wait a minute and try again.');
      } else {
        toast.success('Reset link sent', {
          description: `Check ${parsed.data} for a link to set a new password.`,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData(e.currentTarget);
    const data = { email: String(fd.get('email')), password: String(fd.get('password')) };

    const parsed = signinSchema.safeParse(data);
    if (!parsed.success) {
      setErrors(zodToFieldErrors(parsed.error));
      return;
    }

    setLoading(true);
    try {
      const { data: result, error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) {
        toast.error(error.message);
      } else if (result.session) {
        toast.success('Welcome back to SIRAH LIFE.');
        const home = await resolveHomeForUser(result.session.access_token);
        navigate(home);
      } else {
        toast.error('Sign-in succeeded but no session was returned.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData(e.currentTarget);
    const data = {
      name:     String(fd.get('name')),
      email:    String(fd.get('email')),
      phone:    String(fd.get('phone')),
      password: String(fd.get('password')),
    };

    const parsed = signupSchema.safeParse(data);
    if (!parsed.success) {
      setErrors(zodToFieldErrors(parsed.error));
      return;
    }

    setLoading(true);
    try {
      const { data: result, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: { full_name: parsed.data.name, phone: parsed.data.phone },
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) {
        toast.error(error.message);
      } else if (result.session) {
        // Email confirmation disabled — go straight to onboarding
        toast.success('Welcome to SIRAH LIFE. Let’s set up your workspace.');
        navigate('/onboarding');
      } else {
        // Email confirmation required — user must verify before sign-in
        toast.success('Check your inbox to confirm your email.');
        setMode('signin');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      // redirectTo must match a URL on the **Allowed Redirect URLs** list in
      // Supabase Dashboard → Authentication → URL Configuration. The legacy
      // path here was /sirah/auth which is a 404 — corrected to /auth.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) {
        console.error('[auth] Google OAuth failed:', error);
        // 'provider is not enabled' fires when Google is unchecked in
        // Supabase Dashboard → Authentication → Providers → Google.
        if (/provider is not enabled|disabled/i.test(error.message)) {
          toast.error('Google sign-in not enabled', {
            description: 'Enable Google in Supabase Dashboard → Authentication → Providers.',
          });
        } else {
          toast.error(error.message);
        }
        setLoading(false);
      }
      // Note: no setLoading(false) on the success path — the browser is about
      // to navigate to accounts.google.com, so the React tree will unmount.
    } catch (err) {
      console.error('[auth] Google OAuth threw:', err);
      toast.error((err as Error).message ?? 'Could not start Google sign-in');
      setLoading(false);
    }
  }

  return (
    <div className="relative h-screen overflow-y-auto overflow-x-hidden bg-canvas text-foreground">
      {/* Decorative orbs live in a fixed, self-clipping layer so they never add
          scrollable height - otherwise the page can't scroll to reach a tall
          form (e.g. Create workspace) on short viewports. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <GradientOrb color="blue" size={620} position="-top-40 -left-32" />
        <GradientOrb color="magenta" size={520} position="-bottom-40 -right-20" delay={2} driftDuration={22} />
        <GradientOrb color="mixed" size={420} position="top-1/3 right-1/4" delay={4} driftDuration={26} />
      </div>

      {/* Floating theme toggle - always visible, top-right. Lets the user
          switch between Light / System / Dark without signing in first. */}
      <div className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle className="flex" />
      </div>

      {/* min-h-full (not min-h-screen) so the grid fills the scroll container
          and grows past it when the form is tall - letting the parent scroll. */}
      <div className="relative z-10 mx-auto grid min-h-full w-full max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-10">
        {/* Left column - gradient headline + live preview card */}
        <motion.aside
          variants={stagger(0.08, 0.06)}
          initial="initial"
          animate="animate"
          className="hidden lg:flex lg:flex-col lg:items-start lg:justify-center lg:gap-10"
        >
          <motion.div variants={fadeUp} className="max-w-md space-y-4">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-3.5 py-1.5 text-[11px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-500" />
              </span>
              Wellness OS · for healthcare teams
            </span>
            <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
              Run your practice with a{' '}
              <span className="bg-gradient-to-br from-blue-600 via-teal-500 to-cyan-400 bg-clip-text text-transparent">
                calmer
              </span>{' '}
              kind of intelligence.
            </h1>
            <p className="text-pretty text-base leading-relaxed text-foreground/70 md:text-lg">
              Clients, programs, plates, voice notes, and billing - orchestrated by AI you trust.
            </p>
          </motion.div>

          <motion.div variants={fadeUp}>
            <LiveAuthVisual />
          </motion.div>

          <motion.div variants={fadeUp}>
            <SocialProof />
          </motion.div>
        </motion.aside>

        {/* Form column */}
        <motion.div
          variants={stagger(0.08, 0.06)}
          initial="initial"
          animate="animate"
          className="mx-auto w-full max-w-md lg:mx-0"
        >
          {/* Brand */}
          <motion.div variants={fadeUp} className="mb-8 flex flex-col items-center">
            <Link to="/" className="flex items-center gap-3">
              <BrandMark size={44} />
              <div className="flex flex-col leading-none">
                <Wordmark className="text-lg" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                  by Sirah Digital
                </span>
              </div>
            </Link>
          </motion.div>

          {/* Card - tilts a few degrees toward the cursor for depth */}
          <motion.div
            variants={fadeUp}
            ref={cardRef}
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
            style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
          >
            <AIGlow intensity="soft" animated={false} className="rounded-3xl">
              <Glass variant="heavy" className="rounded-3xl p-7">
                {/* Mode tabs */}
                <div className="mb-6 flex rounded-full bg-foreground/[0.04] p-1">
                  {(['signin', 'signup'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMode(m);
                        setErrors({});
                      }}
                      className={cx(
                        'relative flex-1 rounded-full px-4 py-2 text-xs font-medium transition-colors',
                        mode === m ? 'text-foreground' : 'text-foreground/50 hover:text-foreground/80',
                      )}
                    >
                      {mode === m && (
                        <motion.span
                          layoutId="auth-tab"
                          className="absolute inset-0 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.40)] to-[hsl(var(--brand-magenta)_/_0.30)]"
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        />
                      )}
                      <span className="relative">
                        {m === 'signin' ? 'Sign in' : 'Create workspace'}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Title */}
                <div className="mb-6">
                  <h1 className="text-xl font-semibold tracking-tight">
                    {mode === 'signin' ? 'Welcome back.' : "Let's set up your practice."}
                  </h1>
                  <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">
                    {mode === 'signin'
                      ? 'Sign in to your SIRAH LIFE workspace.'
                      : 'A workspace, a free trial, and your first AI-powered programs in minutes.'}
                  </p>
                </div>

                {/* Google */}
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={loading}
                  className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.04] px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.08] disabled:opacity-60"
                >
                  <GoogleIcon className="h-4 w-4" />
                  Continue with Google
                </button>

                <div className="mb-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-foreground/30">
                  <div className="h-px flex-1 bg-foreground/10" />
                  or
                  <div className="h-px flex-1 bg-foreground/10" />
                </div>

                {/* Form */}
                <AnimatePresence mode="wait" initial={false}>
                  {mode === 'signin' ? (
                    <motion.div
                      key="signin"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                    >
                      {magicSent ? (
                        // Confirmation state: link sent, waiting on the user's inbox.
                        <div className="space-y-5 py-2 text-center">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-400/30 dark:text-emerald-300">
                            <MailCheck className="h-6 w-6" strokeWidth={1.6} />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold tracking-tight">Check your inbox</h3>
                            <p className="mt-1 text-sm leading-relaxed text-foreground/65">
                              We sent a one-tap sign-in link to{' '}
                              <strong className="text-foreground">{magicSent}</strong>.
                              <br />
                              The link expires in 60 minutes.
                            </p>
                          </div>
                          <div className="flex flex-col items-center gap-1 text-xs text-foreground/55">
                            <button
                              type="button"
                              onClick={() => setMagicSent(null)}
                              className="underline-offset-4 hover:text-foreground/85 hover:underline"
                            >
                              Didn't get it? Try a different email.
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Both auth paths visible. The form's onSubmit is the
                        // password path; the magic-link button is a regular
                        // type="button" that reads the same email state.
                        <form onSubmit={handleSignIn} className="space-y-4">
                          <Field
                            label="Email"
                            name="email"
                            type="email"
                            placeholder="you@practice.com"
                            error={errors.email}
                            autoFocus
                            value={email}
                            onChange={setEmail}
                          />
                          <Field
                            label="Password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            error={errors.password}
                            endSlot={
                              <button
                                type="button"
                                onClick={() => setShowPassword((s) => !s)}
                                className="text-foreground/75 hover:text-foreground/70 dark:text-foreground/55"
                                tabIndex={-1}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            }
                          />
                          <div className="-mt-1 flex justify-end">
                            <button
                              type="button"
                              disabled={loading}
                              className="text-xs text-foreground/50 hover:text-foreground disabled:opacity-60"
                              onClick={handleForgotPassword}
                            >
                              Forgot password?
                            </button>
                          </div>
                          <SubmitButton loading={loading}>Sign in</SubmitButton>

                          {/* Subtle hairline divider separates the two paths */}
                          <div className="flex items-center gap-3 pt-1 text-[10px] uppercase tracking-[0.18em] text-foreground/30">
                            <div className="h-px flex-1 bg-foreground/10" />
                            or
                            <div className="h-px flex-1 bg-foreground/10" />
                          </div>

                          {/* Magic-link is a button (not submit) so Enter inside
                              the form still triggers password sign-in. */}
                          <button
                            type="button"
                            onClick={handleSendMagicLink}
                            disabled={loading}
                            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-sm font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.06] disabled:opacity-60"
                          >
                            <Mail className="h-4 w-4 text-teal-600 dark:text-teal-300" />
                            Email me a sign-in link
                          </button>
                        </form>
                      )}
                    </motion.div>
                  ) : (
                    <motion.form
                      key="signup"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                      onSubmit={handleSignUp}
                      className="space-y-4"
                    >
                      <Field label="Your name" name="name" placeholder="Dr. Priya Sharma" error={errors.name} autoFocus />
                      <Field label="Email" name="email" type="email" placeholder="you@practice.com" error={errors.email} />
                      <Field label="Phone" name="phone" type="tel" placeholder="+91 98 76 54 32 10" error={errors.phone} />
                      <Field
                        label="Password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min 8 characters"
                        error={errors.password}
                        endSlot={
                          <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            className="text-foreground/75 dark:text-foreground/55 hover:text-foreground/70"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        }
                      />
                      <SubmitButton loading={loading}>Create workspace</SubmitButton>
                      <p className="text-center text-[11px] leading-relaxed text-foreground/75 dark:text-foreground/55">
                        By creating an account you agree to our Terms and Privacy Policy. Your free
                        trial starts after you choose a plan.
                      </p>
                    </motion.form>
                  )}
                </AnimatePresence>
              </Glass>
            </AIGlow>
          </motion.div>

          {/* Bottom hint */}
          <motion.div variants={fadeUp} className="mt-6 text-center text-xs text-foreground/75 dark:text-foreground/55">
            {mode === 'signin' ? (
              <>
                New here?{' '}
                <button onClick={() => setMode('signup')} className="text-foreground/80 hover:text-foreground">
                  Create a workspace
                </button>
              </>
            ) : (
              <>
                Already have a workspace?{' '}
                <button onClick={() => setMode('signin')} className="text-foreground/80 hover:text-foreground">
                  Sign in
                </button>
              </>
            )}
          </motion.div>

          {/* Trust chip - small but reassuring. Mirrors the hero's trust strip. */}
          <motion.div
            variants={fadeUp}
            className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.18em] text-foreground/45"
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              Secured by Supabase
            </span>
            <span className="hidden h-1 w-1 rounded-full bg-foreground/25 sm:block" />
            <span>DPDP-ready</span>
            <span className="hidden h-1 w-1 rounded-full bg-foreground/25 sm:block" />
            <span>SOC 2 in flight</span>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Sub-components (kept local) ────────────────────────────────────────

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  error?: string;
  autoFocus?: boolean;
  endSlot?: React.ReactNode;
  /** Optional controlled value. Both must be present or omit both. */
  value?: string;
  onChange?: (v: string) => void;
}

function Field({ label, name, type = 'text', placeholder, error, autoFocus, endSlot, value, onChange }: FieldProps) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">{label}</div>
      <div
        className={cx(
          // focus-within drives the glow. transition runs on border + bg + shadow
          // together so the field feels like one smooth response, not a jumble.
          'flex items-center rounded-xl border bg-foreground/[0.03] px-3.5 py-2.5 transition-all duration-200',
          'border-foreground/10 focus-within:border-teal-400/70 focus-within:bg-foreground/[0.06]',
          'focus-within:shadow-[0_0_0_4px_rgba(14,154,168,0.10)]',
          error && 'border-rose-400/60 focus-within:shadow-[0_0_0_4px_rgba(244,63,94,0.10)]',
        )}
      >
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/45 focus:outline-none"
        />
        {endSlot}
      </div>
      {error && <div className="mt-1.5 text-[11px] text-rose-700 dark:text-rose-300/90">{error}</div>}
    </label>
  );
}

interface SubmitButtonProps {
  loading: boolean;
  children: React.ReactNode;
}

function SubmitButton({ loading, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-3 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.01] cta-glow active:scale-[0.97] active:scale-[0.99] disabled:opacity-60"
    >
      {/* Shine sweep - a soft diagonal highlight passes across on hover.
          Pure CSS; no JS / extra DOM. translate-x runs from -200% to 200%. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
      />
      <span className="relative inline-flex items-center gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {children}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </span>
    </button>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#FFC107" d="M21.8 12.2c0-.8-.07-1.6-.2-2.3H12v4.4h5.5c-.24 1.3-.96 2.4-2.04 3.1v2.6h3.3c1.93-1.78 3.04-4.4 3.04-7.8z"/>
      <path fill="#4CAF50" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2.07 1-3.4 1-2.6 0-4.8-1.76-5.58-4.1H3v2.6A10 10 0 0012 22z"/>
      <path fill="#FF3D00" d="M6.42 13.9a6 6 0 010-3.8V7.5H3a10 10 0 000 9l3.42-2.6z"/>
      <path fill="#1976D2" d="M12 5.96c1.47 0 2.78.5 3.82 1.5l2.86-2.86A10 10 0 003 7.5l3.42 2.6c.78-2.34 2.98-4.14 5.58-4.14z"/>
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function zodToFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of err.errors) {
    const k = e.path[0];
    if (typeof k === 'string') out[k] = e.message;
  }
  return out;
}
