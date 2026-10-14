import { Ban, LogOut, ShieldOff } from 'lucide-react';

import { Glass } from '@/design-system';
import { useScope } from '@/hooks/useScope';
import { supabase } from '@/integrations/supabase/client';

/**
 * Full-screen lock for a suspended or deleted practice. The backend
 * (WorkspaceStatusGuard) refuses everyone in it — staff and clients — so this
 * just explains why, instead of a page full of failed requests. Super admins
 * are never locked.
 */
export function WorkspaceUnavailableLock() {
  const { data: scope } = useScope();
  const status = scope?.workspaceStatus;
  if (!scope || scope.isSuperAdmin) return null;
  if (status !== 'suspended' && status !== 'deleted') return null;

  const closed = status === 'deleted';
  const Icon = closed ? Ban : ShieldOff;

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-canvas/90 p-4 backdrop-blur-md" role="alertdialog" aria-modal="true">
      <Glass variant="heavy" className="w-full max-w-lg p-8 text-center md:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose-500/12 text-rose-600 dark:text-rose-300">
          <Icon className="h-7 w-7" />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
          {closed ? 'This practice has been closed' : 'This practice is unavailable'}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground/65">
          {closed
            ? 'This practice is no longer active on NUSI, so its account and app can’t be used.'
            : 'Access to this practice has been paused on NUSI for now.'}{' '}
          If you think this is a mistake, email{' '}
          <a href="mailto:support@sirahdigital.in" className="font-semibold text-[hsl(var(--brand-blue))] hover:underline">
            support@sirahdigital.in
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut().then(() => { window.location.href = '/auth'; })}
          className="mt-7 inline-flex items-center gap-2 rounded-full border border-foreground/15 px-6 py-3 text-sm text-foreground/80 hover:bg-foreground/[0.04]"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </Glass>
    </div>
  );
}
