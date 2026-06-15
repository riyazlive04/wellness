import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import {
  permissionsApi, PERMISSION_LABEL,
  type OverrideEffect, type PermissionOverride,
} from '@/modules/workspace/api/tenancy';

/**
 * PermissionEditorDialog — fine-grained per-member permission overrides.
 *
 * For each catalog permission we show a tri-state: Default (follow the role),
 * Allow (grant override), or Deny (deny override). The "effective" preview
 * reflects role defaults ± the chosen overrides. Saving replaces the member's
 * override set.
 */
type TriState = 'default' | 'grant' | 'deny';

export function PermissionEditorDialog({
  memberId, memberLabel, onClose,
}: {
  memberId: string;
  memberLabel: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const catalogQ = useQuery({ queryKey: ['perm-catalog'], queryFn: permissionsApi.catalog, retry: 1 });
  const memberQ = useQuery({
    queryKey: ['perm-member', memberId],
    queryFn: () => permissionsApi.getMember(memberId),
    retry: 1,
  });

  // Local working state of overrides as a map permission → TriState.
  const [draft, setDraft] = useState<Record<string, TriState> | null>(null);

  const overridesMap = useMemo<Record<string, TriState>>(() => {
    const m: Record<string, TriState> = {};
    for (const o of memberQ.data?.overrides ?? []) m[o.permission] = o.effect;
    return m;
  }, [memberQ.data]);

  const state = draft ?? overridesMap;
  const roleDefaults = new Set(memberQ.data?.role_defaults ?? []);
  const isOwner = memberQ.data?.role === 'owner';

  const setPerm = (perm: string, tri: TriState) => {
    setDraft((d) => ({ ...(d ?? overridesMap), [perm]: tri }));
  };

  const effective = (perm: string): boolean => {
    const tri = state[perm] ?? 'default';
    if (tri === 'grant') return true;
    if (tri === 'deny') return false;
    return roleDefaults.has(perm);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const overrides: PermissionOverride[] = Object.entries(state)
        .filter(([, tri]) => tri !== 'default')
        .map(([permission, tri]) => ({ permission, effect: tri as OverrideEffect }));
      return permissionsApi.setMember(memberId, overrides);
    },
    onSuccess: () => {
      toast.success('Permissions updated');
      void queryClient.invalidateQueries({ queryKey: ['perm-member', memberId] });
      onClose();
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const loading = catalogQ.isLoading || memberQ.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ">
      <Glass className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
          <div>
            <h3 className="text-sm font-medium">Permissions</h3>
            <p className="text-[11px] text-foreground/55">{memberLabel} · {memberQ.data?.role}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-foreground/45 hover:bg-foreground/[0.05]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="grid place-items-center p-8 text-sm text-foreground/55"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : isOwner ? (
            <p className="text-sm text-foreground/65">Owners hold every permission — overrides don't apply.</p>
          ) : (
            <div className="space-y-5">
              {(catalogQ.data?.groups ?? []).map((group) => (
                <div key={group.resource}>
                  <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-foreground/55">{group.label}</div>
                  <div className="space-y-1.5">
                    {group.permissions.map((perm) => {
                      const tri = state[perm] ?? 'default';
                      const isDefault = roleDefaults.has(perm);
                      return (
                        <div key={perm} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm">{PERMISSION_LABEL[perm] ?? perm}</div>
                            <div className={cn('text-[10px]', effective(perm) ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground/40')}>
                              {effective(perm) ? 'allowed' : 'denied'}{tri === 'default' ? ` · role ${isDefault ? 'allows' : 'denies'}` : ` · override`}
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 overflow-hidden rounded-lg border border-foreground/[0.1]">
                            {(['default', 'grant', 'deny'] as TriState[]).map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setPerm(perm, opt)}
                                className={cn(
                                  'px-2.5 py-1 text-[11px] capitalize transition-colors',
                                  tri === opt
                                    ? opt === 'grant' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                      : opt === 'deny' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                        : 'bg-foreground/[0.08] text-foreground'
                                    : 'text-foreground/55 hover:bg-foreground/[0.04]',
                                )}
                              >
                                {opt === 'default' ? 'Role' : opt === 'grant' ? 'Allow' : 'Deny'}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!isOwner && (
          <div className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] px-5 py-3">
            <button type="button" onClick={onClose} className="rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 hover:border-foreground/15">Cancel</button>
            <button
              type="button"
              disabled={saveMut.isPending || loading}
              onClick={() => saveMut.mutate()}
              className={cn('inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-600', saveMut.isPending && 'opacity-60')}
            >
              {saveMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Save permissions
            </button>
          </div>
        )}
      </Glass>
    </div>
  );
}
