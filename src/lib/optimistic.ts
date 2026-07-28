/**
 * Optimistic-update helpers for React Query mutations.
 *
 * WHY: almost every mutation in the app was written as
 *   useMutation({ mutationFn, onSuccess: () => invalidateQueries(...) })
 * which means the UI doesn't change until the write round-trips AND a refetch
 * round-trips after it — two network calls. On a slow connection that's the
 * 8-9 second lag between tapping and seeing anything happen.
 *
 * `optimistic()` patches the cached query data the instant the user acts, so the
 * UI updates immediately; the network write runs in the background, rolls back
 * on error, and reconciles with the server on settle. Actions feel instant
 * regardless of connection speed.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';

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
 * @param opts.also extra query keys to invalidate on settle (e.g. ['me']).
 */
export function optimistic<TData, TVars>(
  qc: QueryClient,
  queryKey: QueryKey,
  patch: (old: TData, vars: TVars) => TData,
  opts: { also?: QueryKey[] } = {},
) {
  return {
    onMutate: async (vars: TVars): Promise<OptimisticContext<TData>> => {
      // Stop any in-flight refetch from clobbering our optimistic value.
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<TData>(queryKey);
      if (prev !== undefined) {
        qc.setQueryData<TData>(queryKey, (old) => (old === undefined ? old : patch(old, vars)));
      }
      return { prev };
    },
    onError: (_err: unknown, _vars: TVars, ctx: OptimisticContext<TData> | undefined) => {
      // Roll back — the server rejected the change.
      if (ctx?.prev !== undefined) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => {
      // Reconcile in the background. This refetch no longer gates the UI.
      void qc.invalidateQueries({ queryKey });
      for (const k of opts.also ?? []) void qc.invalidateQueries({ queryKey: k });
    },
  };
}
