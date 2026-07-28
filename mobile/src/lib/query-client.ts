import { QueryClient } from '@tanstack/react-query';

/**
 * Shared react-query client. Mobile-friendly defaults: don't hammer the API on
 * every screen focus, but do refetch when the app returns from background
 * (wired via AppState in the root layout).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
