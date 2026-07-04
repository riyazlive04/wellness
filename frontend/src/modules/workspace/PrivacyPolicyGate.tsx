import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { policiesApi } from '@/modules/workspace/api/policies';

/**
 * Blocks the owner dashboard with the Sirah Life privacy policy until the
 * workspace owner accepts it. `must_accept` is computed server-side (current
 * policy exists + caller is an owner + not yet accepted), so this component is
 * purely presentational. When the super admin publishes a new version, the
 * acceptance no longer matches and the gate re-appears.
 */
export function PrivacyPolicyGate() {
  const queryClient = useQueryClient();

  const policyQ = useQuery({
    queryKey: ['privacy-policy', 'current'],
    queryFn: policiesApi.current,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const acceptMut = useMutation({
    mutationFn: policiesApi.accept,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['privacy-policy'] });
      toast.success('Thanks — privacy policy accepted.');
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  const data = policyQ.data;
  if (!data?.must_accept || !data.policy) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <Glass className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="flex items-start gap-3 border-b border-foreground/[0.08] px-6 py-4">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.25)] to-[hsl(var(--brand-magenta)_/_0.20)] text-violet-700 dark:text-violet-200">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">{data.policy.title}</h2>
            <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
              SIRAH LIFE · v{data.policy.version} · {new Date(data.policy.published_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-4 text-sm text-foreground/70">
            Please review and accept the Sirah Life privacy policy to continue using your workspace.
          </p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
            {data.policy.content}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-foreground/[0.08] px-6 py-4">
          <button
            type="button"
            disabled={acceptMut.isPending}
            onClick={() => acceptMut.mutate()}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] disabled:opacity-60"
          >
            {acceptMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            I accept
          </button>
        </div>
      </Glass>
    </div>
  );
}
