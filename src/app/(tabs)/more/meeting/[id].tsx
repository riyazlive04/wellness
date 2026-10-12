import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import { MeetingRoomView } from '@/components/meeting-room';
import { ApiError } from '@/lib/api';
import { clientsApi } from '@/lib/clients-api';

/** Client side of a video appointment — the room itself is shared with the
 *  nutritionist portal (see components/meeting-room.tsx). */
export default function MeetingRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const cfgQ = useQuery({
    queryKey: ['me', 'appointments', id, 'meeting'],
    queryFn: () => clientsApi.myMeetingConfig(id!),
    enabled: !!id,
    retry: 1,
  });

  return (
    <MeetingRoomView
      config={cfgQ.data}
      loading={cfgQ.isLoading}
      error={cfgQ.isError}
      errorMessage={refusal(cfgQ.error)}
      fallbackOtherName="your nutritionist"
    />
  );
}

/** 402 = the practice's video hours are used up (or not on its plan): show the server's reason. */
function refusal(err: unknown): string | null {
  return err instanceof ApiError && err.status === 402 ? err.message : null;
}
