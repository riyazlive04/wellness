import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import { MeetingRoomView } from '@/components/meeting-room';
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
      fallbackOtherName="your client"
    />
  );
}
