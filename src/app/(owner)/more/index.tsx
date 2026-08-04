/**
 * More — the full nav map minus the four tabbed destinations.
 *
 * Built from the SAME filtered nav the web sidebar uses, so a manager sees
 * exactly the sections their permissions and plan allow. Nothing here is a
 * locked door.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ListRow, OwnerPage, Pill, Section } from '@/components/owner/ui';
import { AppText, Card } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useOwner } from '@/contexts/owner-context';
import { useTheme } from '@/hooks/use-theme';
import { OWNER_TAB_ROUTES, type BadgeKey } from '@/lib/owner/nav';
import { initials } from '@/lib/owner/format';
import { radius, spacing } from '@/lib/theme';

const TABBED = new Set<string>(OWNER_TAB_ROUTES);

function planLabel(plan: string | null | undefined): string {
  if (!plan) return 'Trial';
  return plan
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function daysLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export default function OwnerMore() {
  const router = useRouter();
  const t = useTheme();
  const { nav, scope, badges, isOwner } = useOwner();
  const { signOut, user } = useAuth();

  const trialDays = daysLeft(scope?.trialEndsAt);

  return (
    <OwnerPage title="More" subtitle={scope?.workspaceRole ? `Signed in as ${scope.workspaceRole}` : undefined}>
      {/* Identity header — gradient avatar + plan, matching the client More hub
          so both halves of the app open the same way. */}
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <LinearGradient
            colors={t.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}>
            <AppText variant="heading" tone="onBrand">
              {initials(user?.email ?? 'You')}
            </AppText>
          </LinearGradient>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="heading" numberOfLines={1}>
              {user?.email ?? 'Your practice'}
            </AppText>
            <AppText variant="muted" tone="muted">
              {isOwner ? 'Workspace owner' : 'Team member'}
            </AppText>
          </View>
          <Pill label={planLabel(scope?.plan)} tone="accent" />
        </View>
        {trialDays !== null ? (
          <AppText variant="caption" tone={trialDays <= 3 ? 'warning' : 'faint'}>
            {trialDays === 0 ? 'Your trial ends today' : `${trialDays} day${trialDays === 1 ? '' : 's'} left in your trial`}
          </AppText>
        ) : null}
      </Card>

      {nav.map((group, gi) => {
        const items = group.items.filter((i) => !TABBED.has(i.to));
        if (!items.length) return null;
        return (
          <Section key={group.label ?? `g${gi}`} title={group.label ?? 'Workspace'}>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {items.map((item, idx) => (
                <ListRow
                  key={item.to}
                  title={item.label}
                  subtitle={item.hint}
                  icon={item.icon}
                  badge={item.badge ? badges?.[item.badge as BadgeKey] : undefined}
                  // Hrefs come from the nav map, so they're strings at this
                  // point rather than literals typed routes can narrow.
                  onPress={() => router.push(item.to as Href)}
                  right={idx === items.length - 1 ? undefined : undefined}
                />
              ))}
            </Card>
          </Section>
        );
      })}

      <Section title="Session">
        <Pressable
          onPress={() =>
            Alert.alert('Sign out?', "You'll need to sign in again to return.", [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
            ])
          }
          style={({ pressed }) => [
            styles.signOut,
            {
              borderColor: t.colors.danger + (t.dark ? '3D' : '2E'),
              backgroundColor: pressed ? t.colors.danger + '14' : 'transparent',
            },
          ]}>
          <Ionicons name="log-out-outline" size={18} color={t.colors.danger} />
          <AppText variant="heading" tone="danger">
            Sign out
          </AppText>
        </Pressable>
      </Section>
    </OwnerPage>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
});
