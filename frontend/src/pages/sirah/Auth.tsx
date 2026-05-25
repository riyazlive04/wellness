import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { supabase } from '@/integrations/supabase/client';
import {
  BrandMark,
  Glass,
  GradientOrb,
  AIGlow,
  fadeUp,
  stagger,
} from '@/design-system';

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
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Welcome back to SIRAH LIFE.');
        navigate('/dashboard');
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
          emailRedirectTo: `${window.location.origin}/sirah/auth`,
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/sirah/auth` },
      });
      if (error) toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-foreground">
      <GradientOrb color="blue" size={620} position="-top-40 -left-32" />
      <GradientOrb color="magenta" size={520} position="-bottom-40 -right-20" delay={2} driftDuration={22} />
      <GradientOrb color="mixed" size={420} position="top-1/3 right-1/4" delay={4} driftDuration={26} />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12">
        <motion.div
          variants={stagger(0.08, 0.06)}
          initial="initial"
          animate="animate"
          className="w-full"
        >
          {/* Brand */}
          <motion.div variants={fadeUp} className="mb-8 flex flex-col items-center">
            <Link to="/" className="flex items-center gap-3">
              <BrandMark size={44} />
              <div className="flex flex-col leading-none">
                <span className="text-lg font-semibold tracking-tight">SIRAH LIFE</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                  by Sirah Digital
                </span>
              </div>
            </Link>
          </motion.div>

          {/* Card */}
          <motion.div variants={fadeUp}>
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
                          className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30"
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
                  <p className="mt-1 text-sm text-foreground/55">
                    {mode === 'signin'
                      ? 'Sign in to your SIRAH workspace.'
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
                    <motion.form
                      key="signin"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                      onSubmit={handleSignIn}
                      className="space-y-4"
                    >
                      <Field label="Email" name="email" type="email" placeholder="you@practice.com" error={errors.email} autoFocus />
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
                            className="text-foreground/40 hover:text-foreground/70"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        }
                      />
                      <div className="flex justify-end -mt-1">
                        <button
                          type="button"
                          className="text-xs text-foreground/50 hover:text-foreground"
                          onClick={() => toast('Password reset coming soon.', { description: 'Reach out to support@sirah.life for now.' })}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <SubmitButton loading={loading}>Sign in</SubmitButton>
                    </motion.form>
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
                            className="text-foreground/40 hover:text-foreground/70"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        }
                      />
                      <SubmitButton loading={loading}>Create workspace</SubmitButton>
                      <p className="text-center text-[11px] leading-relaxed text-foreground/40">
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
          <motion.div variants={fadeUp} className="mt-6 text-center text-xs text-foreground/40">
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
}

function Field({ label, name, type = 'text', placeholder, error, autoFocus, endSlot }: FieldProps) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/60">{label}</div>
      <div
        className={cx(
          'flex items-center rounded-xl border bg-foreground/[0.03] px-3.5 py-2.5 transition-colors',
          'border-foreground/10 focus-within:border-violet-400/60 focus-within:bg-foreground/[0.06]',
          error && 'border-rose-400/60',
        )}
      >
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/30 focus:outline-none"
        />
        {endSlot}
      </div>
      {error && <div className="mt-1.5 text-[11px] text-rose-300/90">{error}</div>}
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
      className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-3 text-sm font-medium text-foreground transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{children}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
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
