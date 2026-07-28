/**
 * Optimistic-update helper for React Query mutations.
 *
 * WHY: most mutations here are written as
 *   useMutation({ mutationFn, onSuccess: () => invalidateQueries(...) })
 * so the UI doesn't change until the write round-trips AND the refetch after it
 * round-trips — two network calls before anything moves. On a slow link that's
 * the multi-second lag between clicking and seeing the result.
 *
 * `optimistic()` patches the cached query data the instant the user acts, rolls
 * back on error (with a toast), and reconciles on settle — so actions feel
 * instant. Mirrors the hand-written pattern already in Chat.tsx, made reusable.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';

interface OptimisticContext<T> {
  prev: T | undefined;
}

/**
 * Build the onMutate/onError/onSettled trio for a mutation that optimistically
 * patches one query's cached data.
 *
 * @param qc        the QueryClient (from useQueryClient()).
 * @param queryKey  the query whose cached data the action changes.
 * @param patch     pure function: (currentData, mutationVars) => nextData.
 * @param opts.errorMessage  toast shown on rollback (default: generic).
 * @param opts.also          extra query keys to invalidate on settle.
 */
export function optimistic<TData, TVars>(
  qc: QueryClient,
  queryKey: QueryKey,
  patch: (old: TData, vars: TVars) => TData,
  opts: { errorMessage?: string; also?: QueryKey[] } = {},
) {
  return {
    onMutate: async (vars: TVars): Promise<OptimisticContext<TData>> => {
      // Stop any in-flight refetch from overwriting our optimistic value.
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<TData>(queryKey);
      if (prev !== undefined) {
        qc.setQueryData<TData>(queryKey, (old) => (old === undefined ? old : patch(old, vars)));
      }
      return { prev };
    },
    onError: (err: unknown, _vars: TVars, ctx: OptimisticContext<TData> | undefined) => {
      if (ctx?.prev !== undefined) qc.setQueryData(queryKey, ctx.prev);
      toast.error(opts.errorMessage ?? (err instanceof Error ? err.message : 'Something went wrong.'));
    },
    onSettled: () => {
      // Reconcile in the background — this refetch no longer gates the UI.
      void qc.invalidateQueries({ queryKey });
      for (const k of opts.also ?? []) void qc.invalidateQueries({ queryKey: k });
    },
  };
}
