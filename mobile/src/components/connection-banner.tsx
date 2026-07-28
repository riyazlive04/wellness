import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { resolveApiBase } from '@/lib/api';
import { spacing } from '@/lib/theme';

/**
 * Global "can't reach the server" banner. Polls the health endpoint and, when
 * it fails, drops a tappable bar over every screen that routes to Settings →
 * Server connection. This is why a dead backend URL used to make every screen
 * look empty with no explanation — now it says so and offers the fix.
 */
export function ConnectionBanner() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const base = await resolveApiBase();
      const res = await fetch(`${base}/api/v1/health`, { method: 'GET' });
      if (!res.ok) throw new Error(String(res.status));
      return true;
    },
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 15_000,
  });

  // Only surface after a confirmed failure — never flicker during the first load.
  if (!health.isError) return null;

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/more/settings')}
      style={[
        styles.bar,
        { backgroundColor: t.colors.danger, paddingTop: insets.top + 6 },
      ]}>
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
      <AppText variant="caption" tone="onBrand" style={{ flex: 1 }}>
        Can&apos;t reach the server — your data may not load. Tap to fix.
      </AppText>
      <Ionicons name="chevron-forward" size={14} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: 8,
  },
});
