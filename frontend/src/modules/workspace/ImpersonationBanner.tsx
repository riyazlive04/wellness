import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';

import { switchApi } from '@/modules/workspace/api/tenancy';
import { supabase } from '@/integrations/supabase/client';

/**
 * ImpersonationBanner — a persistent warning strip shown while a super admin is
 * acting as a workspace. Stopping clears the pin and reloads with the admin's
 * own context. Renders nothing for normal sessions.
 */
export function ImpersonationBanner() {
  const [stopping, setStopping] = useState(false);
  const activeQ = useQuery({
    queryKey: ['workspace', 'active'],
    queryFn: switchApi.active,
    retry: 0,
    staleTime: 60_000,
  });

  if (!activeQ.data?.is_impersonation) return null;

  const stop = async () => {
    setStopping(true);
    try {
      await switchApi.stopImpersonating();
      await supabase.auth.refreshSession().catch(() => {});
      window.location.reload();
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500/15 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
      <Eye className="h-3.5 w-3.5" />
      <span>You're viewing this workspace as a super admin (impersonation).</span>
      <button
        type="button"
        onClick={() => void stop()}
        disabled={stopping}
        className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 px-2.5 py-0.5 font-medium hover:bg-amber-500/40 disabled:opacity-60"
      >
        {stopping && <Loader2 className="h-3 w-3 animate-spin" />}
        Stop
      </button>
    </div>
  );
}
