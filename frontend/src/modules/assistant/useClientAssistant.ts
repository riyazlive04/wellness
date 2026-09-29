import { useQuery } from '@tanstack/react-query';

import { useScope } from '@/hooks/useScope';
import { featuresOf } from '@/lib/planCapabilities';
import { assistantApi } from './api';

/**
 * Whether this client can use the AI assistant: their practice's plan includes
 * it, the practice switched it on, and the practice has a working AI key.
 * Shares the assistant profile query with AssistantChat.
 */
export function useClientAssistant(): { available: boolean; loading: boolean; limitReached: boolean } {
  const { data: scope } = useScope();
  const onPlan = featuresOf(scope).includes('ai_assistant');
  const profileQ = useQuery({
    queryKey: ['assistant', 'me'],
    queryFn: assistantApi.me,
    enabled: onPlan,
    staleTime: 5 * 60_000,
  });
  const p = profileQ.data;
  const gate = p?.clientAssistant;
  const switchedOn = !gate || gate.allowed || gate.reason === 'limit';
  return {
    available: onPlan && !!p && p.aiConfigured && switchedOn,
    loading: onPlan && profileQ.isLoading,
    limitReached: !!gate && !gate.allowed && gate.reason === 'limit',
  };
}
