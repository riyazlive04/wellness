import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import { MeetingRoomView } from '@/components/meeting-room';
import { ApiError } from '@/lib/api';
import { ownerClientsApi } from '@/lib/owner/api/clients';

/** Nutritionist side of a video appointment — same room the client joins. */
export default function OwnerMeetingRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const cfgQ = useQuery({
    queryKey: ['appointments', id, 'meeting'],
    queryFn: () => ownerClientsApi.workspaceMeetingConfig(String(id)),
    enabled: !!id,
    retry: 1,
  });

  return (
    <MeetingRoomView
      config={cfgQ.data}
      loading={cfgQ.isLoading}
      error={cfgQ.isError}
      errorMessage={refusal(cfgQ.error)}
      fallbackOtherName="your client"
    />
  );
}

/** 402 = the practice's video hours are used up (or not on its plan): show the server's reason. */
function refusal(err: unknown): string | null {
  return err instanceof ApiError && err.status === 402 ? err.message : null;
}
