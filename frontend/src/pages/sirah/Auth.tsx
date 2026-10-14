import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/lib/api';

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
  /** A nutritionist still filling their guided onboarding link. */
  practiceSetup?: { token: string; status: string } | null;
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
    const { tier, pendingInvite, practiceSetup } = json.data;
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
        if (practiceSetup?.token) return `/setup/${practiceSetup.token}`;
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

/** Title, subline, panel line and links for each role × mode. */
const COPY: Record<Role, Record<Mode, { title: string; sub: string; cta: string; tag: string; switchQ: string; switchA: string }>> = {
  client: {
    signin: { title: 'Sign in', sub: 'Welcome back to NUSI.', cta: 'Sign in', tag: 'Your meal plan, reminders and nutritionist in one app.', switchQ: 'Invited by your nutritionist?', switchA: 'Create your account' },
    signup: { title: 'Join NUSI', sub: 'Use the invite link from your nutritionist.', cta: 'Open invite', tag: 'Your nutritionist sends you an invite link. Open it to join.', switchQ: 'Already have an account?', switchA: 'Sign in' },
  },
  pro: {
    signin: { title: 'Sign in', sub: 'Welcome back to your practice.', cta: 'Sign in', tag: 'Clients, meal plans, reminders and chats in one place.', switchQ: 'New to NUSI?', switchA: 'Start a 14-day free trial' },
    signup: { title: 'Free trial', sub: '14 days free. No card needed.', cta: 'Start', tag: 'Set up your practice in minutes.', switchQ: 'Already have a practice?', switchA: 'Sign in' },
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
      <div className="grid h-screen place-items-center bg-[#123a0b] text-white">
        <div className="flex flex-col items-center gap-3">
          <img src="/nusi-mark.png" alt="" className="h-12 w-12 rounded-xl" />
          <Loader2 className="h-5 w-5 animate-spin opacity-60" />
          <p className="text-sm opacity-75">Completing sign-in…</p>
        </div>
      </div>
    );
  }

  const copy = COPY[role][mode];
  const clientJoin = joinScreen || (role === 'client' && mode === 'signup');
  const switchMode = () => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErrors({}); };

  return (
    <div className="na-page">
      <style>{FOREST_CSS}</style>
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="na-card"
      >
        {/* Left: layered green panel with the cut-out role tabs */}
        <aside className="na-panel">
          <span className="na-sh na-s1" /><span className="na-sh na-s2" /><span className="na-sh na-s3" /><span className="na-sh na-s4" /><span className="na-sh na-s5" />
          <Link to="/" className="na-brand"><img src="/nusi-mark.png" alt="" />NUSI</Link>
          {!joinScreen && (
            <div className="na-tabs" role="tablist" aria-label="I am">
              {(['client', 'pro'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={role === r}
                  className="na-tab"
                  onClick={() => setRole(r)}
                >
                  {r === 'client' ? 'Client' : 'Nutritionist'}
                </button>
              ))}
            </div>
          )}
          <p className="na-tag">{clientJoin ? COPY.client.signup.tag : copy.tag}</p>
        </aside>

        {/* Right: the form */}
        <div className="na-right">
          <div className="na-form">
            <div className="na-avatar"><img src="/nusi-mark.png" alt="" /></div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={clientJoin ? 'join' : `${role}-${mode}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className="na-head"
              >
                <h1>{clientJoin ? COPY.client.signup.title : copy.title}</h1>
                <p>{clientJoin ? COPY.client.signup.sub : copy.sub}</p>
              </motion.div>
            </AnimatePresence>

            {clientJoin ? (
              <form onSubmit={handleInvite} className="na-fields" noValidate>
                {joinScreen && signedInAs && (
                  <p className="na-note">Signed in as <strong>{signedInAs}</strong>. No nutritionist has invited this email yet.</p>
                )}
                <Underline id="auth-invite" icon="link" placeholder="Paste your invite link" value={inviteLink} onChange={setInviteLink} error={errors.invite} autoFocus />
                <div className="na-actions na-actions-end"><PillButton loading={false}>Open invite</PillButton></div>
                <p className="na-line">No link yet? Ask your nutritionist to share your NUSI invite link on WhatsApp or email.</p>
                {joinScreen ? (
                  <p className="na-line">Wrong account? <button type="button" className="na-link" onClick={() => void signOutAndRestart()}>Sign out</button></p>
                ) : (
                  <p className="na-line">{copy.switchQ} <button type="button" className="na-link" onClick={switchMode}>{copy.switchA}</button></p>
                )}
              </form>
            ) : mode === 'signin' ? (
                <form onSubmit={handleSignIn} className="na-fields" noValidate>
                  <Underline id="auth-email" name="email" type="email" icon="user" placeholder={role === 'pro' ? 'Work email' : 'Email'} autoComplete="email" value={email} onChange={setEmail} error={errors.email} autoFocus />
                  <Underline
                    id="auth-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    icon="lock"
                    placeholder="Password"
                    autoComplete="current-password"
                    error={errors.password}
                    endSlot={<RevealButton shown={showPassword} onClick={() => setShowPassword((s) => !s)} />}
                  />
                  <div className="na-actions">
                    <button type="button" className="na-link na-small" onClick={handleForgotPassword} disabled={loading}>Forgot password?</button>
                    <PillButton loading={loading}>{copy.cta}</PillButton>
                  </div>
                  <p className="na-line">{copy.switchQ} <button type="button" className="na-link" onClick={switchMode}>{copy.switchA}</button></p>
                </form>
            ) : (
              <form onSubmit={handleSignUp} className="na-fields" noValidate>
                <Underline id="auth-name" name="name" icon="user" placeholder="Your name" autoComplete="name" defaultValue={invited.name} error={errors.name} autoFocus />
                <Underline id="auth-su-email" name="email" type="email" icon="mail" placeholder="Work email" autoComplete="email" defaultValue={invited.email} error={errors.email} />
                <Underline id="auth-phone" name="phone" type="tel" icon="phone" placeholder="Phone (10 digits)" autoComplete="tel-national" numeric maxLength={10} defaultValue={invited.phone} error={errors.phone} />
                <Underline
                  id="auth-su-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  icon="lock"
                  placeholder="Password (8+ characters)"
                  autoComplete="new-password"
                  error={errors.password}
                  endSlot={<RevealButton shown={showPassword} onClick={() => setShowPassword((s) => !s)} />}
                />
                <div className="na-actions">
                  <span className="na-small na-muted">By starting a trial you agree to NUSI's Terms and Privacy Policy.</span>
                  <PillButton loading={loading}>{copy.cta}</PillButton>
                </div>
                <p className="na-line">{copy.switchQ} <button type="button" className="na-link" onClick={switchMode}>{copy.switchA}</button></p>
              </form>
            )}
          </div>

          {/* Google sign-in is for nutritionists only; clients use email and password. */}
          {role === 'pro' && !joinScreen && (
            <div className="na-strip">
              <span>{mode === 'signin' ? 'Or sign in with' : 'Or sign up with'}</span>
              <button type="button" className="na-social" onClick={handleGoogle} disabled={loading}>
                <GoogleIcon className="h-[22px] w-[22px]" />Google
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Look ────────────────────────────────────────────────────────────────

/** Forest split card: full green page, layered panel, cut-out tabs, white form. */
const FOREST_CSS = `
@import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap");
.na-page { min-height: 100vh; display: grid; place-items: center; background: #123a0b; padding: 40px 16px; font-family: "Poppins", ui-sans-serif, system-ui, sans-serif; color: #1b241d; }
.na-card { width: min(980px, 100%); min-height: 580px; display: grid; grid-template-columns: 41% 59%; background: #fff; border-radius: 22px; overflow: hidden; box-shadow: 0 40px 90px -30px rgb(0 0 0 / .5); }
.na-panel { position: relative; background: #2f7a14; overflow: hidden; }
.na-sh { position: absolute; }
.na-s1 { width: 160%; height: 70%; left: -60%; top: -32%; background: #1f5a12; transform: rotate(-45deg); box-shadow: 0 10px 30px rgb(0 0 0 / .18); }
.na-s2 { width: 140%; height: 48%; left: -40%; top: 6%; background: #4c9a1e; transform: rotate(-45deg); box-shadow: 0 10px 30px rgb(0 0 0 / .14); }
.na-s3 { width: 70%; height: 140%; right: -28%; top: -20%; background: #b5e08a; transform: rotate(-45deg); opacity: .9; }
.na-s4 { width: 160%; height: 26%; left: -50%; bottom: 8%; background: #78bd3f; transform: rotate(45deg); box-shadow: 0 -10px 30px rgb(0 0 0 / .14); }
.na-s5 { width: 160%; height: 40%; left: -60%; bottom: -30%; background: #1f5a12; transform: rotate(45deg); }
.na-brand { position: absolute; left: 28px; top: 26px; z-index: 2; display: flex; align-items: center; gap: 10px; color: #fff; font-weight: 700; font-size: 18px; letter-spacing: .02em; text-shadow: 0 1px 6px rgb(0 0 0 / .25); }
.na-brand img { width: 34px; height: 34px; border-radius: 9px; box-shadow: 0 4px 12px rgb(0 0 0 / .3); }
.na-tag { position: absolute; left: 28px; right: 28px; bottom: 26px; z-index: 2; margin: 0; max-width: 26ch; color: #fff; font-size: 14px; font-weight: 500; line-height: 1.5; text-shadow: 0 1px 8px rgb(0 0 0 / .35); }
.na-tabs { position: absolute; right: 0; top: 50%; transform: translateY(-50%); z-index: 3; display: grid; gap: 22px; }
.na-tab { position: relative; width: 180px; height: 62px; padding: 0 0 0 34px; border: 0; border-radius: 31px 0 0 31px; background: none; text-align: left; font: 600 15px/1 inherit; font-family: inherit; letter-spacing: .06em; text-transform: uppercase; color: rgb(255 255 255 / .88); cursor: pointer; transition: color .25s; }
.na-tab:hover { color: #fff; }
.na-tab[aria-selected="true"] { background: #fff; color: #1b241d; }
.na-tab[aria-selected="true"]::before, .na-tab[aria-selected="true"]::after { content: ""; position: absolute; right: 0; width: 30px; height: 30px; pointer-events: none; }
.na-tab[aria-selected="true"]::before { top: -30px; border-bottom-right-radius: 30px; box-shadow: 10px 10px 0 10px #fff; }
.na-tab[aria-selected="true"]::after { bottom: -30px; border-top-right-radius: 30px; box-shadow: 10px -10px 0 10px #fff; }
.na-tab:focus-visible { outline: 2px solid #fff; outline-offset: -6px; }
.na-right { display: grid; grid-template-rows: 1fr auto; min-width: 0; }
.na-form { padding: 40px 64px 26px; display: grid; gap: 20px; align-content: center; }
.na-avatar { justify-self: center; width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center; background: radial-gradient(circle at 50% 40%, #78bd3f, #1f5a12); box-shadow: 0 16px 30px -12px rgb(30 70 10 / .55); }
.na-avatar img { width: 62px; height: 62px; border-radius: 16px; }
.na-head { text-align: center; display: grid; gap: 6px; }
.na-head h1 { margin: 0; font-size: 30px; line-height: 1.15; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; color: #1f5a12; }
.na-head p { margin: 0; font-size: 14px; line-height: 1.5; color: #56615a; }
.na-fields { display: grid; gap: 20px; }
.na-ul { display: flex; align-items: center; gap: 14px; padding: 6px 2px 11px; border-bottom: 1.5px solid #c9d1cb; transition: border-color .2s; }
.na-ul:focus-within { border-color: #3f9b0b; }
.na-ul.na-err { border-color: #e11d48; }
.na-ul > svg { width: 21px; height: 21px; flex: none; color: #6f7a73; }
.na-ul input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; padding: 4px 0; font: 400 16px/1.4 inherit; font-family: inherit; color: #1b241d; }
.na-ul input::placeholder { color: #98a29b; }
.na-error { margin: 6px 2px 0; font-size: 12.5px; color: #e11d48; }
.na-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 2px; }
.na-actions-end { justify-content: flex-end; }
.na-pill { height: 46px; min-width: 140px; padding: 0 30px; border: 0; border-radius: 999px; background: #3f9b0b; color: #fff; font: 600 14px/1 inherit; font-family: inherit; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; display: grid; place-items: center; box-shadow: 0 12px 22px -12px rgb(40 110 10 / .8); transition: transform .2s; flex: none; }
.na-pill:hover { transform: translateY(-1px); } .na-pill:active { transform: scale(.98); } .na-pill:disabled { opacity: .65; }
.na-link { border: 0; background: none; padding: 0; font: 600 13.5px/1.5 inherit; font-family: inherit; color: #3f9b0b; cursor: pointer; }
.na-link:disabled { opacity: .6; }
.na-small { font-size: 13px; } .na-muted { color: #8a948d; font-weight: 400; line-height: 1.45; }
.na-line { margin: 0; text-align: center; font-size: 13.5px; line-height: 1.5; color: #56615a; }
.na-note { margin: 0; padding: 12px 14px; border-radius: 14px; background: #f1f6ed; font-size: 13.5px; line-height: 1.5; color: #3c4a40; text-align: center; }
.na-sent { display: grid; justify-items: center; gap: 10px; text-align: center; padding: 6px 0; }
.na-sent-ic { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center; background: #e9f6dd; color: #3f9b0b; }
.na-sent h2 { margin: 0; font-size: 18px; font-weight: 600; }
.na-sent p { margin: 0; font-size: 14px; line-height: 1.5; color: #56615a; }
.na-strip { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 64px; background: #f6f8f5; border-top: 1px solid #edf0ec; box-shadow: 0 -10px 24px -18px rgb(0 0 0 / .2); }
.na-strip span { font-size: 13px; font-weight: 500; color: #56615a; }
.na-social { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 0; border-radius: 10px; background: none; font: 600 13.5px/1 inherit; font-family: inherit; color: #1b241d; cursor: pointer; }
.na-social:hover { background: #ecf0ea; } .na-social:disabled { opacity: .6; }
.na-pill:focus-visible, .na-link:focus-visible, .na-social:focus-visible, .na-brand:focus-visible { outline: 2px solid #3f9b0b; outline-offset: 3px; }
@media (max-width: 760px) {
  .na-page { padding: 0; place-items: stretch; }
  .na-card { grid-template-columns: 1fr; min-height: 100vh; border-radius: 0; }
  .na-panel { height: 190px; }
  .na-tabs { top: auto; bottom: 0; left: 0; right: 0; transform: none; grid-template-columns: 1fr 1fr; gap: 0; padding: 0 16px; }
  .na-tab { width: auto; height: 50px; padding: 0; text-align: center; border-radius: 18px 18px 0 0; font-size: 13px; }
  .na-tab[aria-selected="true"]::before, .na-tab[aria-selected="true"]::after { display: none; }
  .na-tag { display: none; }
  .na-form { padding: 26px 22px 22px; align-content: start; }
  .na-avatar { width: 80px; height: 80px; } .na-avatar img { width: 52px; height: 52px; }
  .na-head h1 { font-size: 25px; }
  .na-strip { padding: 14px 16px 22px; justify-content: center; gap: 8px; flex-wrap: wrap; }
  .na-strip span { width: 100%; text-align: center; }
  .na-social { background: #fff; border: 1px solid #e4e8e3; padding: 10px 14px; }
}
@media (prefers-reduced-motion: reduce) { .na-pill, .na-tab { transition: none; } }
`;

// ─── Sub-components (kept local) ────────────────────────────────────────

const ICONS = {
  user: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.8-3.6-5-8-5Z',
  lock: 'M17 9V7a5 5 0 0 0-10 0v2a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2ZM9 7a3 3 0 0 1 6 0v2H9Zm4 9.7V18h-2v-1.3a2 2 0 1 1 2 0Z',
  mail: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v.5l8 5 8-5V7H4Zm16 2.8-7.5 4.7a1 1 0 0 1-1 0L4 9.8V17h16V9.8Z',
  phone: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1Z',
  link: 'M10.6 13.4a1 1 0 0 1 0-1.4l3-3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0ZM8 17a3 3 0 0 1-2.1-5.1l2-2a1 1 0 1 1 1.4 1.4l-2 2A1 1 0 1 0 8.7 14.7l2-2a1 1 0 1 1 1.4 1.4l-2 2A3 3 0 0 1 8 17Zm8-10a1 1 0 0 0-.7.3l-2 2a1 1 0 1 1-1.4-1.4l2-2a3 3 0 1 1 4.2 4.2l-2 2a1 1 0 1 1-1.4-1.4l2-2A1 1 0 0 0 16 7Z',
} as const;

interface UnderlineProps {
  id: string;
  icon: keyof typeof ICONS;
  placeholder: string;
  name?: string;
  type?: string;
  autoComplete?: string;
  error?: string;
  autoFocus?: boolean;
  endSlot?: React.ReactNode;
  /** Optional controlled value. Both must be present or omit both. */
  value?: string;
  onChange?: (v: string) => void;
  /** Initial value for an uncontrolled field (e.g. pre-filled from a setup link). */
  defaultValue?: string;
  /** Digits only (phone). */
  numeric?: boolean;
  maxLength?: number;
}

/** Underline field with an icon, like the reference design. */
function Underline({ id, icon, placeholder, name, type = 'text', autoComplete, error, autoFocus, endSlot, value, onChange, defaultValue, numeric, maxLength }: UnderlineProps) {
  return (
    <div>
      <label htmlFor={id} className={cx('na-ul', error && 'na-err')}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={ICONS[icon]} /></svg>
        <span className="sr-only">{placeholder}</span>
        <input
          id={id}
          name={name ?? id}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          inputMode={numeric ? 'numeric' : undefined}
          maxLength={maxLength}
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
        />
        {endSlot}
      </label>
      {error && <p id={`${id}-err`} className="na-error">{error}</p>}
    </div>
  );
}

function RevealButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={shown ? 'Hide password' : 'Show password'} className="text-[#98a29b] hover:text-[#56615a]">
      {shown ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
    </button>
  );
}

function PillButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={loading} className="na-pill">
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
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
