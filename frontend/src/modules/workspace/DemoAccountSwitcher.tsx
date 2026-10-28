import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, UserCog } from 'lucide-react';
import { toast } from 'sonner';

import { api, ApiError } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { ROLE_LABEL } from '@/modules/workspace/api/tenancy';

/**
 * Sign in as a member of the demo workspace, for showing NUSI to a prospect.
 *
 * A role preview would be easier to build, but it does not convince: the
 * person watching wants to see the receptionist's actual account, not a
 * simulation of one. So this really signs in as them.
 *
 * No passwords live here. The server checks the caller is allowed, confirms
 * the target belongs to the demo workspace, and mints a one-time Supabase
 * token; the browser only ever sees that token. Anything stored in frontend
 * code is readable by whoever opens devtools, which rules out the obvious
 * approach for accounts that are real logins to a real workspace.
 *
 * Renders nothing when the server returns no accounts, which is the case for
 * every practice that is not the demo - so no real owner ever meets it.
 */

interface DemoAccount {
  user_id: string;
  email: string;
  role: string;
  name: string | null;
  current: boolean;
}

export function DemoAccountSwitcher() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['demo', 'accounts'],
    queryFn: () => api.get<DemoAccount[]>('/api/v1/demo/accounts'),
    // The answer only changes when demo staff change, which is rare.
    staleTime: 10 * 60_000,
    retry: false,
  });

  const accounts = q.data ?? [];
  // One entry means only the account you are already in - nothing to switch to.
  if (accounts.length < 2) return null;

  const current = accounts.find((a) => a.current);

  async function choose(acct: DemoAccount) {
    if (acct.current) {
      setOpen(false);
      return;
    }
    setBusy(acct.email);
    try {
      // The payload goes inside the options object - passing it directly sent
      // no body at all, and the server rejected the request as a missing email.
      const res = await api.post<{ token: string; role: string }>(
        '/api/v1/demo/switch',
        { body: { email: acct.email } },
      );

      // Verify the token in place rather than following a link. Supabase
      // rewrites redirect_to to its allow-list, which dropped the /auth path
      // and dumped the new session on the marketing homepage; verifyOtp
      // never redirects, so there is no path to lose.
      const { error } = await supabase.auth.verifyOtp({
        token_hash: res.token,
        type: 'magiclink',
      });
      if (error) throw error;

      // A full reload, not a route change: every query in memory belongs to
      // the previous account.
      window.location.assign('/dashboard');
    } catch (e) {
      setBusy(null);
      toast.error(
        e instanceof ApiError ? e.message : 'Could not switch to that account.',
      );
    }
  }

  return (
    <div className="relative px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-2.5 py-2 text-left text-xs hover:border-amber-500/50"
      >
        <UserCog className="h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-[0.14em] text-amber-700/80 dark:text-amber-300/70">
            Demo · signed in as
          </div>
          <div className="truncate font-medium text-foreground">
            {current ? ROLE_LABEL[current.role] ?? current.role : 'Owner'}
          </div>
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-foreground/40" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 top-full z-30 mt-1 overflow-hidden rounded-xl border border-foreground/[0.08] bg-popover p-1 shadow-2xl">
            <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-foreground/40">
              Sign in as
            </div>
            {accounts.map((a) => (
              <button
                key={a.user_id}
                type="button"
                disabled={!!busy}
                onClick={() => void choose(a)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-foreground/[0.05] disabled:opacity-50',
                  a.current && 'bg-foreground/[0.04]',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">
                    {ROLE_LABEL[a.role] ?? a.role}
                  </div>
                  <div className="truncate text-[10px] text-foreground/45">
                    {a.name ?? a.email}
                  </div>
                </div>
                {busy === a.email ? (
                  <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-foreground/40" />
                ) : a.current ? (
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-teal-600 dark:text-teal-400" />
                ) : null}
              </button>
            ))}
            <div className="px-2.5 pb-1.5 pt-1 text-[10px] leading-relaxed text-foreground/40">
              Signs this browser in as that account.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
