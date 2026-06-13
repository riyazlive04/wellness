import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { switchApi } from '@/modules/workspace/api/tenancy';
import { ROLE_LABEL } from '@/modules/workspace/api/tenancy';
import { supabase } from '@/integrations/supabase/client';

/**
 * WorkspaceSwitcher — dropdown for users who belong to more than one workspace.
 * Switching pins the workspace server-side, refreshes the session so the new
 * JWT carries the new context, and reloads. Renders nothing for single-
 * workspace users.
 */
export function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const membershipsQ = useQuery({
    queryKey: ['workspace', 'memberships'],
    queryFn: switchApi.memberships,
    retry: 0,
    staleTime: 60_000,
  });

  const memberships = membershipsQ.data ?? [];
  if (memberships.length < 2) return null;

  const current = memberships.find((m) => m.is_active) ?? memberships[0];

  const choose = async (workspaceId: string) => {
    if (workspaceId === current.workspace_id) { setOpen(false); return; }
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

  return (
    <div className="relative px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-foreground/[0.08] px-2.5 py-2 text-left text-xs hover:border-foreground/15"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-foreground">{current.name}</div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-foreground/45">{ROLE_LABEL[current.role] ?? current.role}</div>
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-foreground/40" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-foreground/[0.08] bg-popover p-1 shadow-2xl">
            {memberships.map((m) => (
              <button
                key={m.workspace_id}
                type="button"
                onClick={() => void choose(m.workspace_id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                  m.is_active ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.04]',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-foreground">{m.name}</div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-foreground/45">{ROLE_LABEL[m.role] ?? m.role}</div>
                </div>
                {switching === m.workspace_id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/40" />
                ) : m.is_active ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : null}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
