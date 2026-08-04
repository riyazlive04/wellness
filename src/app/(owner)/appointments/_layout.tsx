import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function OwnerAppointmentsLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.canvas } }} />
  );
}
