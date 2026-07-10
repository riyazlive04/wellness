import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Minus } from 'lucide-react';

import { permissionsApi, ROLE_LABEL, PERMISSION_LABEL } from '@/modules/workspace/api/tenancy';

/** Column order — owner first, then most→least privileged staff roles. */
const ROLE_ORDER = [
  'owner', 'manager', 'nutritionist', 'assistant_nutritionist', 'receptionist', 'coach', 'support',
];

/**
 * RolePermissionsTable — the "what each role can do" reference matrix. Driven
 * by the live permission catalog (all roles × every permission, grouped by
 * feature), so it always matches the real ROLE_PERMISSIONS defaults. Per-member
 * overrides refine these on top; this shows the baseline.
 */
export function RolePermissionsTable() {
  const catalogQ = useQuery({
    queryKey: ['perm-catalog'],
    queryFn: permissionsApi.catalog,
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });

  if (catalogQ.isLoading) {
    return (
      <div className="grid place-items-center rounded-2xl border border-foreground/[0.06] p-10 text-foreground/50">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  const catalog = catalogQ.data;
  if (!catalog) return null;

  const roles = ROLE_ORDER.filter((r) => r in catalog.roleDefaults);
  const has = (role: string, perm: string) => (catalog.roleDefaults[role] ?? []).includes(perm);

  return (
    <div className="overflow-x-auto rounded-2xl border border-foreground/[0.06]">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-[10px] uppercase tracking-[0.16em] text-foreground/75 dark:text-foreground/60">
            <th className="px-5 py-3 text-left font-normal">Capability</th>
            {roles.map((r) => (
              <th key={r} className="whitespace-nowrap px-3 py-3 text-center font-normal">
                {ROLE_LABEL[r] ?? r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {catalog.groups.map((group) => (
            <Fragment key={group.resource}>
              <tr className="bg-foreground/[0.015]">
                <td
                  colSpan={roles.length + 1}
                  className="px-5 pb-1 pt-3 text-[10px] uppercase tracking-[0.16em] text-foreground/45"
                >
                  {group.label}
                </td>
              </tr>
              {group.permissions.map((perm) => (
                <tr key={perm} className="border-b border-foreground/[0.04] last:border-0">
                  <td className="px-5 py-2.5 text-foreground/85">{PERMISSION_LABEL[perm] ?? perm}</td>
                  {roles.map((r) => (
                    <td key={r} className="px-3 py-2.5 text-center">
                      {has(r, perm) ? (
                        <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-emerald-400/15 text-emerald-700 dark:text-emerald-300">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-foreground/[0.04] text-foreground/30">
                          <Minus className="h-3 w-3" />
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
