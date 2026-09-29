import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { switchApi } from '@/modules/workspace/api/tenancy';
import { supabase } from '@/integrations/supabase/client';

/**
 * The practices this user belongs to, and a way to switch between them.
 * Switching pins the workspace server-side, refreshes the session so the new
 * JWT carries the new context, and reloads. Shared by the sidebar switcher and
 * the top bar's practice pill.
 */
export function useWorkspaceSwitch() {
  const [switching, setSwitching] = useState<string | null>(null);
  const membershipsQ = useQuery({
    queryKey: ['workspace', 'memberships'],
    queryFn: switchApi.memberships,
    retry: 0,
    staleTime: 60_000,
  });
  const memberships = membershipsQ.data ?? [];
  const current = memberships.find((m) => m.is_active) ?? memberships[0] ?? null;

  const choose = async (workspaceId: string): Promise<void> => {
    if (workspaceId === current?.workspace_id) return;
    setSwitching(workspaceId);
    try {
      await switchApi.switch(workspaceId);
      await supabase.auth.refreshSession().catch(() => {});
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
      setSwitching(null);
    }
  };

  return { memberships, current, canSwitch: memberships.length > 1, switching, choose };
}
