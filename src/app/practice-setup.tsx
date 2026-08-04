/**
 * Landing spot for a signed-in user who belongs to no workspace and has no
 * client record (scope tier `unaffiliated`) — a practitioner who created an
 * account but hasn't set up a practice yet.
 *
 * Practice creation (workspace name, slug, plan, GST details) lives on the web
 * onboarding wizard. Rather than dead-end them on a failed /me/profile fetch —
 * which is what this tier used to hit — we say plainly what's missing and give
 * them the two ways out.
 */
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';

import { ActionButton } from '@/components/owner/ui';
import { AppText, Card, GhostButton, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useScope } from '@/hooks/use-scope';
import { useTheme } from '@/hooks/use-theme';
import { radius, spacing } from '@/lib/theme';

const WEB_ONBOARDING_URL = 'https://nusi.sirahagents.com/onboarding';

export default function PracticeSetup() {
  const t = useTheme();
  const { signOut } = useAuth();
  const scopeQ = useScope();

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <View style={[styles_icon, { backgroundColor: t.colors.surfaceStrong }]}>
          <Ionicons name="leaf-outline" size={28} color={t.colors.accent} />
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText variant="title">Finish setting up your practice</AppText>
          <AppText variant="muted" tone="muted">
            {"Your account isn't linked to a practice yet. Create one on the web — it takes a minute — then sign back in here and your dashboard will be waiting."}
          </AppText>
        </View>

        <Card style={{ gap: spacing.sm }}>
          <AppText variant="caption" tone="faint">
            {'If you were invited as a client instead, ask your nutritionist to re-send your invite link.'}
          </AppText>
        </Card>

        <View style={{ gap: spacing.sm }}>
          <ActionButton
            label="Open web setup"
            icon="open-outline"
            onPress={() => void WebBrowser.openBrowserAsync(WEB_ONBOARDING_URL)}
          />
          <GhostButton label="I've done that — refresh" onPress={() => void scopeQ.refetch()} />
          <GhostButton label="Sign out" onPress={() => void signOut()} />
        </View>
      </View>
    </Screen>
  );
}

const styles_icon = {
  width: 56,
  height: 56,
  borderRadius: radius.pill,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
