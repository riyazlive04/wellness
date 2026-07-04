import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { useOwnerIdentity } from '@/hooks/useOwnerIdentity';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { policiesApi } from '@/modules/workspace/api/policies';
import { workspacesApi } from '@/modules/workspace/api/workspaces';

export default function OwnerPrivacyPolicy() {
  const queryClient = useQueryClient();
  const { ownerName, initials } = useOwnerIdentity();

  const wsQ = useQuery({ queryKey: ['workspace', 'me'], queryFn: workspacesApi.me, retry: 1 });
  const policyQ = useQuery({
    queryKey: ['privacy-policy', 'current'],
    queryFn: policiesApi.current,
    retry: 1,
  });

  const acceptMut = useMutation({
    mutationFn: policiesApi.accept,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['privacy-policy'] });
      toast.success('Privacy policy accepted.');
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  const data = policyQ.data;

  return (
    <OwnerLayout
      practiceName={wsQ.data?.display_name ?? wsQ.data?.name ?? 'Your Practice'}
      ownerName={ownerName}
      initials={initials}
      topbarContext="Privacy policy"
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-6">
          <motion.div variants={fadeUp}>
            <span className="text-xs uppercase tracking-[0.18em] text-foreground/55">SIRAH LIFE</span>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Privacy policy</h1>
            <p className="mt-1 text-sm text-foreground/60">
              The privacy policy published by Sirah Life that governs your workspace.
            </p>
          </motion.div>

          {policyQ.isLoading ? (
            <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </Glass>
          ) : !data?.policy ? (
            <Glass className="p-10 text-center text-sm text-foreground/55">
              No privacy policy has been published yet.
            </Glass>
          ) : (
            <motion.div variants={fadeUp}>
              <Glass className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/[0.08] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.25)] to-[hsl(var(--brand-magenta)_/_0.20)] text-violet-700 dark:text-violet-200">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold tracking-tight">{data.policy.title}</h2>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                        v{data.policy.version} · {new Date(data.policy.published_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {data.accepted ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Accepted
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={acceptMut.isPending}
                      onClick={() => acceptMut.mutate()}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-xs font-medium text-white hover:scale-[1.02] disabled:opacity-60"
                    >
                      {acceptMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                      I accept
                    </button>
                  )}
                </div>
                <div className="whitespace-pre-wrap px-6 py-6 text-sm leading-relaxed text-foreground/85">
                  {data.policy.content}
                </div>
              </Glass>
            </motion.div>
          )}
        </motion.div>
      </div>
    </OwnerLayout>
  );
}
