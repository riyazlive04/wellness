import { useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ROLE_LABEL } from '@/modules/workspace/api/tenancy';
import { useWorkspaceSwitch } from './useWorkspaceSwitch';

/**
 * WorkspaceSwitcher — dropdown for users who belong to more than one workspace.
 * Renders nothing for single-workspace users.
 */
export function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const { memberships, current, canSwitch, switching, choose: switchTo } = useWorkspaceSwitch();
  if (!canSwitch || !current) return null;

  const choose = async (workspaceId: string) => {
    if (workspaceId === current.workspace_id) { setOpen(false); return; }
    await switchTo(workspaceId);
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
