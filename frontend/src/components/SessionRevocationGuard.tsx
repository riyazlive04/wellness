import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtime, disconnectRealtime } from '@/lib/realtime';

/**
 * Listens for a server "session.revoked" push targeted at THIS device (its own
 * session room). When the user signs this device out from another device's
 * Settings → Security, we immediately end the local session and show a blocking
 * "you've been signed out" screen prompting a fresh login.
 */
export function SessionRevocationGuard() {
  const [revoked, setRevoked] = useState(false);

  useRealtime<unknown>('session.revoked', () => setRevoked(true));

  useEffect(() => {
    if (!revoked) return;
    void (async () => {
      try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
      disconnectRealtime();
    })();
  }, [revoked]);

  if (!revoked) return null;

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-canvas/95 backdrop-blur-sm p-6">
      <div className="w-full max-w-sm rounded-2xl border border-foreground/10 bg-background p-6 text-center shadow-2xl">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-300">
          <LogOut className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">You’ve been signed out</h2>
        <p className="mt-1 text-sm text-foreground/70">
          This device was signed out remotely. Please sign in again to continue.
        </p>
        <button
          type="button"
          onClick={() => window.location.assign('/')}
          className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
        >
          Sign in again
        </button>
      </div>
    </div>
  );
}
