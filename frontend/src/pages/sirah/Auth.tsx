import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Link2, Loader2, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/lib/api';
import { ThemeToggle } from '@/modules/workspace/ThemeToggle';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';

interface ScopeAfterSignIn {
  tier: 'super_admin' | 'workspace' | 'client' | 'unaffiliated';
  /** Present only when an unaffiliated account was already invited as a client. */
  pendingInvite?: {
    kind: 'preapproval' | 'join_request';
    workspaceName: string;
    joinToken: string | null;
  } | null;
}

type Role = 'client' | 'pro';
type Mode = 'signin' | 'signup';

/**
 * Who the person said they are, kept across the Google / magic-link round
 * trip (the page that started it is gone by the time the provider redirects
 * back) so an uninvited client isn't walked into practice creation.
 */
const ROLE_KEY = 'nusi-auth-role';
function readRoleIntent(): Role | null {
  try {
    const v = sessionStorage.getItem(ROLE_KEY);
    return v === 'client' || v === 'pro' ? v : null;
  } catch {
    return null;
  }
}
function saveRoleIntent(role: Role): void {
  try { sessionStorage.setItem(ROLE_KEY, role); } catch { /* private mode */ }
}

/**
 * The app opens in dark mode by default, but the sign-in page is designed
 * white. Show it light unless the person has picked a theme themselves.
 */
const THEME_KEY = 'sirah-ui-theme';
function useLightUnlessChosen(): void {
  useLayoutEffect(() => {
    let chosen: string | null = null;
    try { chosen = localStorage.getItem(THEME_KEY); } catch { /* private mode */ }
    if (chosen) return;
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';
    return () => {
      // Leave it alone if they used the theme switch while here.
      let now: string | null = null;
      try { now = localStorage.getItem(THEME_KEY); } catch { /* private mode */ }
      if (now) return;
      root.classList.remove('light');
      if (hadDark) root.classList.add('dark');
      root.style.colorScheme = '';
    };
  }, []);
}

/** Shown to a signed-in client who has no invite yet: paste the nutritionist's link. */
const JOIN_SCREEN = '/auth?join=1';

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
async function resolveHomeForUser(accessToken: string, intent: Role | null): Promise<string> {
  // Without a scope, a client must not be dropped into practice creation.
  const fallback = intent === 'client' ? JOIN_SCREEN : '/onboarding';
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/me/scope`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error('[auth] /me/scope failed', res.status, await res.text().catch(() => ''));
      return fallback;
    }
    const json = (await res.json()) as { data: ScopeAfterSignIn };
    const { tier, pendingInvite } = json.data;
    switch (tier) {
      case 'super_admin':  return '/admin';
      case 'workspace':    return '/dashboard';
      case 'client':       return '/portal';
      case 'unaffiliated':
        /*
          /onboarding is PRACTITIONER workspace creation, so it is only right
          for someone who actually came to start a practice. An invited client
          who signs in here first — one tap with Google — would otherwise be
          walked through creating their own practice on a trial instead of
          joining the one that invited them.
        */
        if (pendingInvite?.kind === 'join_request') return '/portal/pending';
        if (pendingInvite?.kind === 'preapproval' && pendingInvite.joinToken) {
          // Hands off to the existing join flow, which auto-approves a
          // pre-approved email and creates the client record.
          return `/join/${pendingInvite.joinToken}`;
        }
        // A pre-approval whose link has expired still must not become practice
        // creation: park them on the pending screen so the practice can finish
        // the job, rather than silently spawning a second workspace.
        if (pendingInvite) return '/portal/pending';
        // Said "I'm a client" but nobody has invited them: ask for the link.
        return intent === 'client' ? JOIN_SCREEN : '/onboarding';
    }
  } catch (err) {
    if (!(err instanceof ApiError)) console.error('[auth] /me/scope failed', err);
  }
  return fallback;
}

/**
 * True when this page load is a provider redirect landing rather than someone
 * opening the login form.
 *
 * Supabase returns the PKCE code on the query string and the older implicit
 * grant on the hash; provider errors can arrive on either. Checking both means
 * we show "completing sign-in" instead of flashing the login form at a user who
 * has already authenticated with Google.
 */
function isAuthCallback(): boolean {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return !!(
    query.get('code') || hash.get('access_token') ||
    query.get('error') || hash.get('error')
  );
}

/**
 * The provider's error, if it sent one.
 *
 * These never surface through the SDK — Google/Supabase put them straight on
 * the redirect URL — so without reading them here a denied consent screen or a
 * misconfigured redirect URI looks identical to "nothing happened".
 */
function readCallbackError(): string | null {
  if (typeof window === 'undefined') return null;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return (
    query.get('error_description') ?? hash.get('error_description') ??
    query.get('error') ?? hash.get('error')
  );
}

/** Drop the auth params so a refresh can't replay a spent (single-use) code. */
function stripCallbackParams(): void {
  window.history.replaceState({}, '', window.location.pathname);
}

/** The token from a pasted invite link ("https://nusi.in/join/abc…") or the bare token. */
function tokenFromInvite(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/join\/([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{6,}$/.test(s) ? s : null;
}

const signinSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
});

const signupSchema = z.object({
  name: z.string().min(2, 'Tell us your name'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().regex(/^\d{10}$/, 'Enter your 10-digit phone number'),
  password: z.string().min(8, 'At least 8 characters'),
});

/** Headline, subline and links for each role × mode. */
const COPY: Record<Role, Record<Mode, { title: [string, string]; sub: string; cta: string; switchQ: string; switchA: string }>> = {
  client: {
    signin: { title: ['Sign in to ', 'NUSI.'], sub: 'Your plan, reminders and nutritionist.', cta: 'Sign in', switchQ: 'Invited by your nutritionist?', switchA: 'Create your account' },
    signup: { title: ['Join ', 'NUSI.'], sub: 'Clients join with the invite link from their nutritionist.', cta: 'Continue', switchQ: 'Already have an account?', switchA: 'Sign in' },
  },
  pro: {
    signin: { title: ['Your practice, ', 'on NUSI.'], sub: 'Clients, plans and chats in one place.', cta: 'Sign in', switchQ: 'New to NUSI?', switchA: 'Start a 14-day free trial' },
    signup: { title: ['Start your ', 'practice.'], sub: '14 days free. No card needed.', cta: 'Start free trial', switchQ: 'Already have a practice?', switchA: 'Sign in' },
  },
};

export default function SirahAuth() {
  const navigate = useNavigate();
  useLightUnlessChosen();
  // A setup link (nusi.in/start, or /auth?mode=signup) opens on the
  // nutritionist's "Start a free trial", optionally pre-filled:
  // ?name=&email=&phone=. ?role=client opens on the client side.
  const [params] = useSearchParams();
  const invited = {
    name: params.get('name')?.slice(0, 80) ?? undefined,
    email: params.get('email')?.slice(0, 120) ?? undefined,
    phone: params.get('phone')?.replace(/\D/g, '').slice(-10) || undefined,
  };
  const wantsSignup = ['signup', 'create'].includes(params.get('mode') ?? '');
  const joinScreen = params.get('join') === '1';
  const [role, setRoleState] = useState<Role>(() => {
    if (wantsSignup) return 'pro';
    if (params.get('role') === 'client' || joinScreen) return 'client';
    if (params.get('role') === 'pro') return 'pro';
    return readRoleIntent() ?? 'client';
  });
  const [mode, setMode] = useState<Mode>(() => (wantsSignup ? 'signup' : 'signin'));
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Both auth paths read from the same controlled email input. Password is
  // still uncontrolled (FormData on submit) since only handleSignIn needs it.
  const [email, setEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  // magicSent flips on after a successful OTP request so the form can swap
  // to the "check your inbox" confirmation panel.
  const [magicSent, setMagicSent] = useState<string | null>(null);
  // Set on a provider redirect landing so the login form doesn't flash while
  // the code is exchanged and the destination resolved.
  const [completing, setCompleting] = useState(() => !joinScreen && isAuthCallback());
  // On the invite screen the person is already signed in; show who.
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  // Whoever lands the user first wins: the password path navigates directly,
  // and onAuthStateChange also fires SIGNED_IN for it. Without this guard both
  // run and /me/scope is requested twice per sign-in.
  const landed = useRef(false);

  function setRole(next: Role) {
    setRoleState(next);
    saveRoleIntent(next);
    setErrors({});
  }

  /**
   * Finish any sign-in that did NOT come from the password form — Google's
   * redirect back to /auth, a magic link, or an already-signed-in user opening
   * the login page.
   *
   * signInWithOAuth navigates away from the app entirely, so the code that
   * started the flow is long gone by the time Google redirects back. Landing
   * the user is therefore the callback's job, not the button's.
   */
  useEffect(() => {
    let cancelled = false;

    // The invite screen is reached signed in, on purpose: don't bounce away.
    if (joinScreen) {
      void supabase.auth.getSession().then(({ data }) => {
        if (!cancelled) setSignedInAs(data.session?.user.email ?? null);
      });
      return () => { cancelled = true; };
    }

    const providerError = readCallbackError();
    if (providerError) {
      toast.error('Google sign-in failed', { description: providerError });
      stripCallbackParams();
      setCompleting(false);
      return;
    }

    async function land(accessToken: string) {
      if (cancelled || landed.current) return;
      landed.current = true;
      setCompleting(true);
      const home = await resolveHomeForUser(accessToken, readRoleIntent());
      if (cancelled) return;
      stripCallbackParams();
      // replace: not history the user should be able to go "back" into.
      navigate(home, { replace: true });
    }

    const isCallback = isAuthCallback();

    // Fires once detectSessionInUrl has exchanged the code for a session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) void land(session.access_token);
    });

    // Covers the races the listener can't: a session restored from storage
    // before this effect subscribed, or SIGNED_IN having already fired.
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) return land(data.session.access_token);
        // No session AND no code to exchange — an ordinary visit to the login
        // page. On a callback landing we must NOT drop out of the completing
        // state here: the exchange can still be in flight.
        if (!cancelled && !isCallback) setCompleting(false);
      })
      .catch(() => {
        if (!cancelled && !isCallback) setCompleting(false);
      });

    // ...but a callback that never produces a session (a replayed single-use
    // code, a clock-skewed PKCE verifier) must not spin forever either.
    const timeout = isCallback
      ? window.setTimeout(() => {
          if (cancelled || landed.current) return;
          toast.error('Sign-in could not be completed', {
            description: 'The sign-in link may have already been used. Please try again.',
          });
          stripCallbackParams();
          setCompleting(false);
        }, 15_000)
      : undefined;

    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, [navigate, joinScreen]);

  // "Email me a sign-in link". Reads the same email field as the password form.
  async function handleSendMagicLink() {
    setErrors({});
    const trimmed = email.trim().toLowerCase();
    const parsed = z.string().email('Enter a valid email').safeParse(trimmed);
    if (!parsed.success) {
      setErrors({ email: 'Enter your email above first' });
      return;
    }
    saveRoleIntent(role);
    setLoading(true);
    try {
      // shouldCreateUser:false — this only signs in existing accounts.
      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data,
        options: { emailRedirectTo: `${window.location.origin}/auth`, shouldCreateUser: false },
      });
      if (error) {
        if (/not found|doesn't exist|user not allowed|signups? not allowed/i.test(error.message)) {
          toast.error('No account for that email', {
            description: role === 'pro' ? 'Tap "Start a 14-day free trial" to sign up.' : 'Use the invite link from your nutritionist to join.',
          });
        } else {
          toast.error(error.message);
        }
      } else {
        setMagicSent(parsed.data);
        toast.success('Sign-in link sent');
      }
    } finally {
      setLoading(false);
    }
  }

  // "Forgot password?" — emails a recovery link that lands on /reset-password.
  async function handleForgotPassword() {
    setErrors({});
    const trimmed = email.trim().toLowerCase();
    const parsed = z.string().email('Enter a valid email').safeParse(trimmed);
    if (!parsed.success) {
      setErrors({ email: 'Enter your email first, then tap "Forgot password?"' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Supabase returns success even for unknown emails (anti-enumeration), so
      // we always show the same reassuring message.
      if (error && /rate|too many/i.test(error.message)) {
        toast.error('Too many attempts. Wait a minute and try again.');
      } else if (error) {
        toast.error(error.message);
      } else {
        toast.success('Reset link sent', { description: `Check ${parsed.data} for a link to set a new password.` });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData(e.currentTarget);
    const parsed = signinSchema.safeParse({ email: String(fd.get('email')), password: String(fd.get('password')) });
    if (!parsed.success) {
      setErrors(zodToFieldErrors(parsed.error));
      return;
    }
    saveRoleIntent(role);
    setLoading(true);
    try {
      const { data: result, error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) {
        toast.error(/invalid login/i.test(error.message) ? 'Wrong email or password.' : error.message);
      } else if (result.session) {
        // Claim the landing before awaiting: signInWithPassword also emits
        // SIGNED_IN, and the callback effect would otherwise resolve the scope
        // a second time.
        landed.current = true;
        const home = await resolveHomeForUser(result.session.access_token, role);
        navigate(home, { replace: true });
      } else {
        toast.error('Sign-in succeeded but no session was returned.');
      }
    } finally {
      setLoading(false);
    }
  }

  /** Nutritionist: create the account, then set up the practice. */
  async function handleSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData(e.currentTarget);
    const parsed = signupSchema.safeParse({
      name: String(fd.get('name')),
      email: String(fd.get('email')),
      phone: String(fd.get('phone')),
      password: String(fd.get('password')),
    });
    if (!parsed.success) {
      setErrors(zodToFieldErrors(parsed.error));
      return;
    }
    saveRoleIntent('pro');
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
        landed.current = true;
        // Same check as sign-in: an invited client who tapped the wrong side
        // goes to their nutritionist, not into creating a practice.
        const home = await resolveHomeForUser(result.session.access_token, 'pro');
        if (home === '/onboarding') toast.success('Welcome to NUSI. Let’s set up your practice.');
        navigate(home, { replace: true });
      } else {
        toast.success('Check your inbox to confirm your email.');
        setMode('signin');
      }
    } finally {
      setLoading(false);
    }
  }

  /** Client: open their nutritionist's invite link. */
  function handleInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = tokenFromInvite(inviteLink);
    if (!token) {
      setErrors({ invite: 'Paste the full link your nutritionist sent, e.g. nusi.in/join/…' });
      return;
    }
    navigate(`/join/${token}`);
  }

  async function handleGoogle() {
    saveRoleIntent(role);
    setLoading(true);
    try {
      // redirectTo must be on the Allowed Redirect URLs list in Supabase.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) {
        console.error('[auth] Google OAuth failed:', error);
        toast.error(/provider is not enabled|disabled/i.test(error.message) ? 'Google sign-in is not enabled.' : error.message);
        setLoading(false);
      }
      // No setLoading(false) on success: the browser is leaving for Google.
    } catch (err) {
      console.error('[auth] Google OAuth threw:', err);
      toast.error((err as Error).message ?? 'Could not start Google sign-in');
      setLoading(false);
    }
  }

  async function signOutAndRestart() {
    await supabase.auth.signOut();
    window.location.replace('/auth?role=client');
  }

  if (completing) {
    return (
      <div className="grid h-screen place-items-center bg-white text-[#0b0d0c] dark:bg-[#070908] dark:text-[#f4f6f4]">
        <div className="flex flex-col items-center gap-3">
          <img src="/nusi-mark.png" alt="" className="h-12 w-12 rounded-xl" />
          <Loader2 className="h-5 w-5 animate-spin opacity-40" />
          <p className="text-sm opacity-60">Completing sign-in…</p>
        </div>
      </div>
    );
  }

  const copy = COPY[role][mode];
  const clientJoin = joinScreen || (role === 'client' && mode === 'signup');

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white text-[#0b0d0c] dark:bg-[#070908] dark:text-[#f4f6f4]">
      {/* Soft moving colour wash behind the form. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 -top-24 h-[640px] overflow-hidden">
        <div className="auth-aura absolute inset-0 opacity-60 blur-[60px] dark:opacity-25" />
      </div>
      <style>{`
        .auth-aura { background:
          radial-gradient(38% 48% at 32% 40%, #d6f2bb, transparent 70%),
          radial-gradient(34% 44% at 68% 32%, #e6eefc, transparent 70%),
          radial-gradient(28% 38% at 55% 66%, #fff1d4, transparent 70%); }
        @media (prefers-reduced-motion: no-preference) { .auth-aura { animation: auth-drift 16s ease-in-out infinite alternate; } }
        @keyframes auth-drift { to { transform: translate3d(4%, 3%, 0) scale(1.08); } }
      `}</style>

      <div className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle className="flex" />
      </div>

      {!joinScreen && <SideMoments role={role} />}

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto flex min-h-screen w-full max-w-[440px] flex-col justify-center gap-4 px-5 py-14"
      >
        {/* Brand + headline */}
        <div className="mb-3 flex flex-col items-center gap-4 text-center">
          <Link to="/" className="inline-flex items-center gap-2.5 text-[17px] font-bold tracking-tight">
            <img src="/nusi-mark.png" alt="" className="h-8 w-8 rounded-[9px]" />
            NUSI
          </Link>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={clientJoin ? 'join' : `${role}-${mode}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center gap-3"
            >
              <h1 className="text-balance text-[44px] font-bold leading-none tracking-[-0.045em] sm:text-[58px]">
                {copy.title[0]}
                <span className="text-[#3f9b0b] dark:text-[#8fdc3a]">{copy.title[1]}</span>
              </h1>
              <p className="text-[16.5px] leading-relaxed text-[#3c423e] dark:text-[#a3aba5]">{copy.sub}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {!joinScreen && <RoleSwitch role={role} onChange={(r) => { setRole(r); setMagicSent(null); }} />}

        {clientJoin ? (
          <form onSubmit={handleInvite} className="flex flex-col gap-4" noValidate>
            {joinScreen && signedInAs && (
              <p className="rounded-2xl bg-[#f5f6f4] px-4 py-3 text-center text-sm text-[#3c423e] dark:bg-white/5 dark:text-[#a3aba5]">
                Signed in as <strong className="text-[#0b0d0c] dark:text-white">{signedInAs}</strong>. No nutritionist has invited this email yet.
              </p>
            )}
            <FloatField
              id="auth-invite"
              label="Paste your invite link"
              name="invite"
              value={inviteLink}
              onChange={setInviteLink}
              error={errors.invite}
              autoFocus
              startIcon={<Link2 className="h-4 w-4 opacity-40" />}
            />
            <PrimaryButton loading={false}>Open my invite</PrimaryButton>
            <p className="text-center text-sm leading-relaxed text-[#8a918c]">
              No link yet? Ask your nutritionist to share your NUSI invite link on WhatsApp or email.
            </p>
            {joinScreen ? (
              <p className="text-center text-sm text-[#8a918c]">
                Wrong account? <TextButton onClick={() => void signOutAndRestart()}>Sign out</TextButton>
              </p>
            ) : (
              <SwitchLine q={copy.switchQ} a={copy.switchA} onClick={() => { setMode('signin'); setErrors({}); }} />
            )}
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="flex h-14 items-center justify-center gap-2.5 rounded-[14px] border border-[#e4e7e3] bg-white text-[15px] font-medium transition-colors hover:bg-[#f5f6f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f9b0b] disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07]"
            >
              <GoogleIcon className="h-[18px] w-[18px]" />
              Continue with Google
            </button>
            <div className="flex items-center gap-3.5 text-[12.5px] text-[#8a918c] before:h-px before:flex-1 before:bg-[#e4e7e3] after:h-px after:flex-1 after:bg-[#e4e7e3] dark:before:bg-white/10 dark:after:bg-white/10">or</div>

            {mode === 'signin' ? (
              magicSent ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e9f6dd] text-[#3f9b0b] dark:bg-[#8fdc3a]/10 dark:text-[#8fdc3a]">
                    <MailCheck className="h-6 w-6" strokeWidth={1.7} />
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight">Check your inbox</h2>
                  <p className="text-sm leading-relaxed text-[#3c423e] dark:text-[#a3aba5]">
                    We sent a sign-in link to <strong className="text-[#0b0d0c] dark:text-white">{magicSent}</strong>. It works for 60 minutes.
                  </p>
                  <TextButton onClick={() => setMagicSent(null)}>Use a different email</TextButton>
                </div>
              ) : (
                <form onSubmit={handleSignIn} className="flex flex-col gap-3.5" noValidate>
                  <FloatField id="auth-email" label={role === 'pro' ? 'Work email' : 'Email'} name="email" type="email" autoComplete="email" error={errors.email} value={email} onChange={setEmail} autoFocus />
                  <FloatField
                    id="auth-password"
                    label="Password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    error={errors.password}
                    endSlot={<RevealButton shown={showPassword} onClick={() => setShowPassword((s) => !s)} />}
                  />
                  <div className="-mt-1 flex justify-between text-[13.5px]">
                    <TextButton onClick={handleSendMagicLink} disabled={loading}>Email me a sign-in link</TextButton>
                    <TextButton onClick={handleForgotPassword} disabled={loading}>Forgot password?</TextButton>
                  </div>
                  <PrimaryButton loading={loading}>{copy.cta}</PrimaryButton>
                  <SwitchLine q={copy.switchQ} a={copy.switchA} onClick={() => { setMode('signup'); setErrors({}); }} />
                </form>
              )
            ) : (
              <form onSubmit={handleSignUp} className="flex flex-col gap-3.5" noValidate>
                <FloatField id="auth-name" label="Your name" name="name" autoComplete="name" error={errors.name} defaultValue={invited.name} autoFocus />
                <FloatField id="auth-su-email" label="Work email" name="email" type="email" autoComplete="email" error={errors.email} defaultValue={invited.email} />
                <FloatField id="auth-phone" label="Phone (10 digits)" name="phone" type="tel" numeric maxLength={10} autoComplete="tel-national" error={errors.phone} defaultValue={invited.phone} />
                <FloatField
                  id="auth-su-password"
                  label="Password (8+ characters)"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  error={errors.password}
                  endSlot={<RevealButton shown={showPassword} onClick={() => setShowPassword((s) => !s)} />}
                />
                <PrimaryButton loading={loading}>{copy.cta}</PrimaryButton>
                <p className="text-center text-[12px] leading-relaxed text-[#8a918c]">
                  By starting a trial you agree to NUSI's Terms and Privacy Policy.
                </p>
                <SwitchLine q={copy.switchQ} a={copy.switchA} onClick={() => { setMode('signin'); setErrors({}); }} />
              </form>
            )}
          </>
        )}

        <p className="mt-6 text-center text-[12px] text-[#8a918c]">Secure sign-in · Your health data stays private</p>
      </motion.main>
    </div>
  );
}

// ─── Sub-components (kept local) ────────────────────────────────────────

/** A floating card on the empty sides of wide screens. */
function Moment({ className, delay, children }: { className: string; delay: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cx('absolute', className)}
    >
      <div
        className="auth-float rounded-[22px] border border-black/[0.05] bg-white/90 p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_48px_-24px_rgb(40_60_20/0.30)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05] dark:shadow-none"
        style={{ animationDelay: `${delay * -4}s` }}
      >
        {children}
      </div>
    </motion.div>
  );
}

function Chip({ bg, children }: { bg: string; children: React.ReactNode }) {
  return <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg', bg)}>{children}</span>;
}

/**
 * NUSI in action, on the empty sides of wide screens: what a client sees, or
 * what a nutritionist sees, following the role switch. Illustrative examples,
 * not anyone's real data. Hidden below 1280px so the form stays the focus.
 */
function SideMoments({ role }: { role: Role }) {
  const label = 'text-[13.5px] font-semibold leading-tight text-[#0b0d0c] dark:text-white';
  const sub = 'mt-0.5 text-[12px] leading-snug text-[#8a918c]';
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 hidden xl:block">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .auth-float { animation: auth-float 7s ease-in-out infinite alternate; }
        }
        @keyframes auth-float { to { transform: translateY(-10px); } }
      `}</style>
      <AnimatePresence mode="wait">
        {role === 'client' ? (
          <motion.div key="client" className="absolute inset-0" exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            {/* left */}
            <Moment className="left-[7%] top-[16%] w-[270px]" delay={0.1}>
              <div className="flex items-center gap-3">
                <Chip bg="bg-sky-100 dark:bg-sky-400/15">💧</Chip>
                <div className="min-w-0"><div className={label}>Time for a glass of water</div><div className={sub}>From your nutritionist · now</div></div>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="rounded-full bg-[#3f9b0b] px-3 py-1.5 text-[12px] font-semibold text-white">+1 glass</span>
                <span className="rounded-full bg-[#f5f6f4] px-3 py-1.5 text-[12px] font-medium text-[#3c423e] dark:bg-white/10 dark:text-white/70">Later</span>
              </div>
            </Moment>
            <Moment className="left-[11%] top-[42%] w-[250px]" delay={0.25}>
              <img src="/illustrations/hero-produce-bowl-sm.webp" alt="" className="h-36 w-full rounded-2xl object-cover" />
              <div className="mt-3 flex items-center justify-between">
                <div><div className={label}>Lunch logged</div><div className={sub}>Dal, rice and salad</div></div>
                <div className="text-right"><div className="text-[15px] font-bold tabular-nums text-[#0b0d0c] dark:text-white">520</div><div className="text-[11px] text-[#8a918c]">kcal</div></div>
              </div>
            </Moment>
            <Moment className="left-[6%] top-[76%] w-[230px]" delay={0.4}>
              <div className="flex items-center gap-3">
                <Chip bg="bg-amber-100 dark:bg-amber-400/15">🍽️</Chip>
                <div><div className={label}>Dinner time</div><div className={sub}>8:00 PM · Meal reminder</div></div>
              </div>
            </Moment>
            {/* right */}
            <Moment className="right-[8%] top-[15%] w-[240px]" delay={0.15}>
              <div className="flex items-center gap-4">
                <svg viewBox="0 0 44 44" className="h-14 w-14 -rotate-90">
                  <circle cx="22" cy="22" r="18" fill="none" strokeWidth="5" className="stroke-[#eef2ea] dark:stroke-white/10" />
                  <circle cx="22" cy="22" r="18" fill="none" strokeWidth="5" strokeLinecap="round" stroke="#3f9b0b" strokeDasharray="113" strokeDashoffset="26" />
                </svg>
                <div><div className="text-[18px] font-bold tabular-nums text-[#0b0d0c] dark:text-white">1,240</div><div className={sub}>of 1,600 kcal today</div></div>
              </div>
            </Moment>
            <Moment className="right-[12%] top-[40%] w-[260px]" delay={0.3}>
              <div className={label}>This week's meal plan</div>
              <div className={sub}>Week 2 · from your nutritionist</div>
              <div className="mt-3 flex h-14 items-end gap-1.5">
                {[55, 70, 62, 84, 100, 66, 58].map((h, i) => (
                  <span key={i} className={cx('flex-1 rounded-md', i === 4 ? 'bg-[#3f9b0b]' : 'bg-[#dcefc9] dark:bg-[#8fdc3a]/25')} style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[10.5px] text-[#8a918c]">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
            </Moment>
            <Moment className="right-[7%] top-[72%] w-[270px]" delay={0.45}>
              <div className="flex items-start gap-3">
                <img src="/nusi-mark.png" alt="" className="h-9 w-9 rounded-full" />
                <div className="rounded-2xl rounded-tl-md bg-[#f5f6f4] px-3.5 py-2.5 text-[13px] leading-snug text-[#0b0d0c] dark:bg-white/10 dark:text-white">
                  Great progress this week! Keep the evening walks going 👏
                </div>
              </div>
            </Moment>
          </motion.div>
        ) : (
          <motion.div key="pro" className="absolute inset-0" exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            {/* left */}
            <Moment className="left-[7%] top-[17%] w-[270px]" delay={0.1}>
              <div className="flex items-center gap-3">
                <Chip bg="bg-[#e9f6dd] dark:bg-[#8fdc3a]/15">🎉</Chip>
                <div><div className={label}>New client joined</div><div className={sub}>From your invite link · just now</div></div>
              </div>
            </Moment>
            <Moment className="left-[10%] top-[38%] w-[260px]" delay={0.25}>
              <div className={label}>Today</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[['Check-ins', '6'], ['Meals', '18'], ['Calls', '2']].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-[#f5f6f4] py-2.5 dark:bg-white/[0.06]">
                    <div className="text-[17px] font-bold tabular-nums text-[#0b0d0c] dark:text-white">{v}</div>
                    <div className="text-[10.5px] text-[#8a918c]">{k}</div>
                  </div>
                ))}
              </div>
            </Moment>
            <Moment className="left-[6%] top-[68%] w-[250px]" delay={0.4}>
              <img src="/illustrations/hero-produce-bowl-sm.webp" alt="" className="h-28 w-full rounded-2xl object-cover" />
              <div className="mt-3"><div className={label}>Lunch logged by a client</div><div className={sub}>520 kcal · 24 g protein</div></div>
            </Moment>
            {/* right */}
            <Moment className="right-[8%] top-[16%] w-[260px]" delay={0.15}>
              <div className="flex items-center gap-3">
                <Chip bg="bg-violet-100 dark:bg-violet-400/15">📋</Chip>
                <div><div className={label}>Meal plan published</div><div className={sub}>Week 2 · copied to 3 clients</div></div>
              </div>
            </Moment>
            <Moment className="right-[12%] top-[40%] w-[250px]" delay={0.3}>
              <div className={label}>Reminders sent</div>
              <div className={sub}>Diabetic routine · today</div>
              <div className="mt-3 space-y-2 text-[12.5px] text-[#3c423e] dark:text-white/70">
                {[['6:30 AM', 'Methi water'], ['1:30 PM', 'Lunch time'], ['Every hour', 'Glass of water']].map(([t, w]) => (
                  <div key={t} className="flex justify-between gap-3"><span className="font-semibold tabular-nums">{t}</span><span>{w}</span></div>
                ))}
              </div>
            </Moment>
            <Moment className="right-[7%] top-[70%] w-[260px]" delay={0.45}>
              <div className="flex items-center gap-3">
                <Chip bg="bg-sky-100 dark:bg-sky-400/15">💬</Chip>
                <div><div className={label}>2 new messages</div><div className={sub}>Clients asking about tomorrow's plan</div></div>
              </div>
            </Moment>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RoleSwitch({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div role="group" aria-label="I am" className="relative grid grid-cols-2 rounded-[14px] bg-[#f5f6f4] p-1 dark:bg-white/[0.06]">
      {(['client', 'pro'] as const).map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={role === r}
          onClick={() => onChange(r)}
          className={cx(
            'relative py-3 text-[14.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f9b0b]',
            role === r ? 'text-[#3f9b0b] dark:text-[#0b0d0c]' : 'text-[#8a918c] hover:text-[#3c423e] dark:hover:text-white/80',
          )}
        >
          {role === r && (
            <motion.span
              layoutId="auth-role"
              className="absolute inset-0 rounded-[10px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_-4px_rgb(0_0_0/0.12)] dark:bg-[#8fdc3a]"
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            />
          )}
          <span className="relative">{r === 'client' ? "I'm a client" : "I'm a nutritionist"}</span>
        </button>
      ))}
    </div>
  );
}

interface FloatFieldProps {
  id: string;
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  error?: string;
  autoFocus?: boolean;
  endSlot?: React.ReactNode;
  startIcon?: React.ReactNode;
  /** Optional controlled value. Both must be present or omit both. */
  value?: string;
  onChange?: (v: string) => void;
  /** Initial value for an uncontrolled field (e.g. pre-filled from a setup link). */
  defaultValue?: string;
  /** Digits only (phone). */
  numeric?: boolean;
  maxLength?: number;
}

/** Input whose label sits inside it and floats up once you type. */
function FloatField({ id, label, name, type = 'text', autoComplete, error, autoFocus, endSlot, startIcon, value, onChange, defaultValue, numeric, maxLength }: FloatFieldProps) {
  return (
    <div>
      <div
        className={cx(
          'relative flex h-[58px] items-center rounded-[14px] border bg-white transition-shadow dark:bg-white/[0.03]',
          error ? 'border-rose-400' : 'border-[#e4e7e3] focus-within:border-[#3f9b0b] dark:border-white/10 dark:focus-within:border-[#8fdc3a]',
          'focus-within:shadow-[0_0_0_4px_rgb(63_155_11/0.12)]',
        )}
      >
        {startIcon && <span className="pl-4">{startIcon}</span>}
        <div className="relative h-full flex-1">
          <input
            id={id}
            name={name}
            type={type}
            autoComplete={autoComplete}
            inputMode={numeric ? 'numeric' : undefined}
            maxLength={maxLength}
            placeholder=" "
            autoFocus={autoFocus}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-err` : undefined}
            value={value}
            defaultValue={value === undefined ? defaultValue : undefined}
            onChange={onChange ? (e) => onChange(e.target.value) : undefined}
            onInput={numeric ? (e) => {
              const el = e.currentTarget;
              let cleaned = el.value.replace(/\D/g, '');
              if (maxLength) cleaned = cleaned.slice(0, maxLength);
              if (cleaned !== el.value) el.value = cleaned;
            } : undefined}
            className="peer h-full w-full rounded-[14px] bg-transparent px-4 pb-2 pt-[22px] text-base text-[#0b0d0c] outline-none dark:text-white"
          />
          <label
            htmlFor={id}
            className="pointer-events-none absolute left-4 top-[10px] text-[11.5px] text-[#3c423e] transition-all duration-200 peer-placeholder-shown:top-[19px] peer-placeholder-shown:text-[15px] peer-placeholder-shown:text-[#8a918c] peer-focus:top-[10px] peer-focus:text-[11.5px] peer-focus:text-[#3c423e] dark:text-[#b6beb8] dark:peer-focus:text-[#b6beb8]"
          >
            {label}
          </label>
        </div>
        {endSlot && <span className="pr-4">{endSlot}</span>}
      </div>
      {error && <p id={`${id}-err`} className="mt-1.5 px-1 text-[12.5px] text-rose-600 dark:text-rose-300">{error}</p>}
    </div>
  );
}

function RevealButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={shown ? 'Hide password' : 'Show password'} className="text-[#8a918c] hover:text-[#3c423e] dark:hover:text-white">
      {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

function PrimaryButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex h-14 items-center justify-center rounded-[14px] bg-[#3f9b0b] text-[15.5px] font-semibold text-white transition-transform hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f9b0b] active:scale-[0.985] disabled:opacity-60 dark:bg-[#8fdc3a] dark:text-[#071003]"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}

function TextButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="font-medium text-[#3c423e] underline-offset-4 hover:text-[#0b0d0c] hover:underline disabled:opacity-60 dark:text-[#b6beb8] dark:hover:text-white">
      {children}
    </button>
  );
}

function SwitchLine({ q, a, onClick }: { q: string; a: string; onClick: () => void }) {
  return (
    <p className="mt-1 text-center text-sm text-[#8a918c]">
      {q}{' '}
      <button type="button" onClick={onClick} className="border-b border-current font-medium text-[#0b0d0c] dark:text-white">
        {a}
      </button>
    </p>
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
