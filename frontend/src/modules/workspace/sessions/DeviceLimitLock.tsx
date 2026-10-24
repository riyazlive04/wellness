import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, Loader2, LogOut, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { ApiError, api } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';

/**
 * Shown when this device cannot be used because the same login is already
 * active elsewhere.
 *
 * One browser session and one mobile session per staff login. The server is
 * what enforces it (DeviceLimitGuard answers 409), so this screen explains the
 * block and offers the way out rather than being the block itself.
 *
 * It names the other device and gives one button to end that session, because
 * the alternative - silently signing the other device out - leaves someone at
 * a desk wondering why their work disappeared. Here the person choosing is the
 * one who knows whether the other session is their own phone or a colleague
 * who should have their own login.
 */

/** What the 409 carries beside the message. */
export interface DeviceLimitInfo {
  kind: 'web' | 'mobile';
  session: {
    id: string;
    user_agent: string | null;
    ip: string | null;
    last_active_at: string;
    model: string | null;
  };
}

/**
 * Pull the device-limit details out of a failed request, or null if it was
 * some other error. Narrow on purpose: a 409 from anything else, or a network
 * blip, must never put this lock on the screen.
 */
export function deviceLimitFrom(err: unknown): DeviceLimitInfo | null {
  if (!(err instanceof ApiError) || err.code !== 'device_limit_reached') return null;
  const c = err.context ?? {};
  const s = c.session as DeviceLimitInfo['session'] | undefined;
  if (!s?.id) return null;
  return {
    kind: c.kind === 'mobile' ? 'mobile' : 'web',
    session: s,
  };
}

/** "Windows PC · Chrome" from a UA, or the real model when we captured one. */
function describe(s: DeviceLimitInfo['session']): string {
  const ua = s.user_agent ?? '';
  if (s.model) return s.model;

  let os = 'Unknown device';
  if (/iPhone/.test(ua)) os = 'iPhone';
  else if (/iPad/.test(ua)) os = 'iPad';
  else if (/okhttp|Android/.test(ua)) os = 'Android phone';
  else if (/CFNetwork|Darwin/.test(ua)) os = 'iPhone';
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'Mac';
  else if (/Windows NT/.test(ua)) os = 'Windows PC';
  else if (/CrOS/.test(ua)) os = 'Chromebook';
  else if (/Linux/.test(ua)) os = 'Linux';

  let browser = '';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Version\/.*Safari/.test(ua)) browser = 'Safari';

  return browser ? `${os} · ${browser}` : os;
}

/** "2 minutes ago" - the only thing that tells you if it is in use right now. */
function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return 'active just now';
  if (mins < 60) return `active ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `active ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `active ${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Mounts the lock when this device is the one over the limit.
 *
 * It probes a guarded endpoint rather than waiting for some other query to
 * fail, for the same reason TrialExpiredLock reads scope directly: the lock
 * has to be certain, and a page whose queries all happen to be on open paths
 * would otherwise render as a broken shell with no explanation.
 *
 * `retry: false` matters - a 409 here is a settled answer, not a blip.
 */
export function DeviceLimitGate() {
  const probe = useQuery({
    queryKey: ['device-limit-probe'],
    queryFn: () => api.get<unknown>('/api/v1/workspaces/me/limits'),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const info = deviceLimitFrom(probe.error);
  if (!info) return null;
  return <DeviceLimitLock info={info} />;
}

export function DeviceLimitLock({ info }: { info: DeviceLimitInfo }) {
  const qc = useQueryClient();
  const [ending, setEnding] = useState(false);
  const other = info.session;
  const Icon = info.kind === 'mobile' ? Smartphone : Laptop;

  // Nothing behind this screen should keep polling while it is up: every
  // request would be answered 409 and the retries are pure noise.
  useEffect(() => {
    qc.cancelQueries();
  }, [qc]);

  async function endOther() {
    setEnding(true);
    try {
      await api.delete(`/api/v1/me/sessions/${other.id}`);
      // The slot is free, but React Query holds a page of failed queries and
      // the shell was never allowed to load. A reload is the honest way back
      // into a fully working app.
      window.location.reload();
    } catch (e) {
      setEnding(false);
      toast.error(e instanceof ApiError ? e.message : 'Could not end that session.');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/auth';
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-canvas/90 p-4 backdrop-blur-sm">
      <Glass variant="heavy" className="w-full max-w-md p-7">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
          <Icon className="h-6 w-6" />
        </span>

        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          Already signed in {info.kind === 'mobile' ? 'on another phone' : 'on another device'}
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-foreground/65">
          Your plan allows one browser and one phone per login. To use NUSI here, end the
          session below — or sign in with your own account if this login belongs to a colleague.
        </p>

        <div className="mt-5 flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
          <Icon className="h-4 w-4 shrink-0 text-foreground/50" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{describe(other)}</div>
            <div className="text-[11px] text-foreground/50">
              {ago(other.last_active_at)}
              {other.ip ? ` · ${other.ip}` : ''}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04]"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
          <button
            type="button"
            disabled={ending}
            onClick={endOther}
            className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-teal-50 hover:bg-teal-800 disabled:opacity-50"
          >
            {ending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            End that session and continue here
          </button>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-foreground/45">
          Each person at your practice should have their own login — their own name in the
          activity log, and their own access. Add one from Team space.
        </p>
      </Glass>
    </div>
  );
}
