/**
 * Shown when the practice this account belongs to was suspended or closed on
 * NUSI. The backend refuses every request from it (WorkspaceStatusGuard), so
 * this explains why instead of a screen full of errors. Both staff and clients
 * land here; super admins never do.
 */
import { Ionicons } from '@expo/vector-icons';
import { Linking, StyleSheet, View } from 'react-native';

import { AppText, Card, GhostButton, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useScope } from '@/hooks/use-scope';
import { useTheme } from '@/hooks/use-theme';
import { spacing } from '@/lib/theme';

export default function PracticeUnavailable() {
  const t = useTheme();
  const { signOut } = useAuth();
  const scopeQ = useScope();
  const closed = scopeQ.data?.workspaceStatus === 'deleted';

  return (
    <Screen>
      <View style={styles.wrap}>
        <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
          <View style={[styles.icon, { backgroundColor: t.colors.danger + (t.dark ? '2E' : '1A') }]}>
            <Ionicons name={closed ? 'close-circle' : 'pause-circle'} size={36} color={t.colors.danger} />
          </View>
          <AppText variant="title" style={{ textAlign: 'center', fontSize: 22 }}>
            {closed ? 'This practice has been closed' : 'This practice is unavailable'}
          </AppText>
          <AppText variant="muted" tone="muted" style={{ textAlign: 'center', lineHeight: 20 }}>
            {closed
              ? 'This practice is no longer active on NUSI, so the app can’t be used with it.'
              : 'Access to this practice has been paused on NUSI for now.'}{' '}
            If you think this is a mistake, contact support.
          </AppText>
          <AppText
            variant="body"
            tone="accent"
            style={{ fontWeight: '700' }}
            onPress={() => void Linking.openURL('mailto:support@sirahdigital.in')}>
            support@sirahdigital.in
          </AppText>
          <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm }}>
            <GhostButton label="Check again" onPress={() => void scopeQ.refetch()} />
            <GhostButton label="Sign out" onPress={() => void signOut()} />
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
