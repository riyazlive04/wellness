import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { AppText, GhostButton, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type MeetingJoin } from '@/lib/clients-api';
import { spacing } from '@/lib/theme';

function meetingUrl(cfg: MeetingJoin): string | null {
  if (cfg.provider === 'daily' && cfg.room_url) {
    return cfg.jwt ? `${cfg.room_url}${cfg.room_url.includes('?') ? '&' : '?'}t=${encodeURIComponent(cfg.jwt)}` : cfg.room_url;
  }
  if (!cfg.domain || !cfg.room) return null;
  const base = `https://${cfg.domain}/${cfg.room}`;
  const params = new URLSearchParams({
    'config.prejoinPageEnabled': 'false',
    'config.disableDeepLinking': 'true',
  });
  if (cfg.jwt) params.set('jwt', cfg.jwt);
  return `${base}#${params.toString()}`;
}

export default function MeetingRoom() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const cfgQ = useQuery({
    queryKey: ['me', 'appointments', id, 'meeting'],
    queryFn: () => clientsApi.myMeetingConfig(id!),
    enabled: !!id,
    retry: 1,
  });

  const cfg = cfgQ.data;
  const url = useMemo(() => (cfg ? meetingUrl(cfg) : null), [cfg]);

  return (
    <Screen edges={[]} style={{ backgroundColor: '#0b141a' }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: 'rgba(255,255,255,0.1)' }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="heading" style={{ color: '#fff' }}>
            {cfg ? cfg.kind.replace(/_/g, ' ') : 'Meeting'}
          </AppText>
          <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.55)' }}>
            with {cfg?.other_name ?? 'your nutritionist'}
          </AppText>
        </View>
        <Pressable onPress={() => router.back()} style={styles.leave}>
          <Ionicons name="call" size={14} color="#fff" />
          <AppText variant="caption" style={{ color: '#fff' }}>
            Leave
          </AppText>
        </Pressable>
      </View>

      {cfgQ.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      ) : cfgQ.isError || !cfg ? (
        <View style={styles.center}>
          <AppText variant="muted" style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
            Appointment not found.
          </AppText>
        </View>
      ) : cfg.mode !== 'video' || !url ? (
        <View style={styles.center}>
          <AppText variant="heading" style={{ color: '#fff', textAlign: 'center' }}>
            This is a {cfg.mode === 'phone' ? 'phone' : 'in-person'} appointment
          </AppText>
          <AppText variant="muted" style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
            No in-app video room for this session.
          </AppText>
          <GhostButton label="Back" onPress={() => router.back()} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            source={{ uri: url }}
            style={{ flex: 1, backgroundColor: '#0b141a' }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            mediaCapturePermissionGrantType="grant"
            startInLoadingState
            renderLoading={() => (
              <View style={[StyleSheet.absoluteFill, styles.center]}>
                <ActivityIndicator color={t.colors.accent} />
              </View>
            )}
          />
          <Pressable
            onPress={() => void Linking.openURL(url)}
            style={{ padding: spacing.md, alignItems: 'center' }}>
            <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Open in browser instead
            </AppText>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#0b141a',
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(244,63,94,0.9)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: '#0b141a',
  },
});
