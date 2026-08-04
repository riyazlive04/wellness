import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/** Stack for everything that didn't earn a tab. Headers are per-screen. */
export default function OwnerMoreLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.canvas } }} />
  );
}
