import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Dest {
  label: string;
  icon: IoniconName;
  route?: Href;
}

const SECTIONS: { group: string; items: Dest[] }[] = [
  {
    group: 'Wellness',
    items: [
      { label: 'Habits', icon: 'repeat-outline', route: '/(tabs)/more/habits' },
      { label: 'Journal', icon: 'create-outline', route: '/(tabs)/more/journal' },
      { label: 'Wellbeing', icon: 'heart-outline', route: '/(tabs)/more/wellbeing' },
      { label: 'Cycle', icon: 'water-outline', route: '/(tabs)/more/cycle' },
    ],
  },
  {
    group: 'Plan',
    items: [
      { label: 'Goals', icon: 'flag-outline', route: '/(tabs)/more/goals' },
      { label: 'Programs', icon: 'clipboard-outline', route: '/(tabs)/more/programs' },
      { label: 'Assessments', icon: 'checkbox-outline', route: '/(tabs)/more/assessments' },
      { label: 'Timeline', icon: 'time-outline', route: '/(tabs)/more/timeline' },
    ],
  },
  {
    group: 'Library & records',
    items: [
      { label: 'Recipes', icon: 'book-outline', route: '/(tabs)/more/recipes' },
      { label: 'Supplements', icon: 'medkit-outline', route: '/(tabs)/more/supplements' },
      { label: 'Reports', icon: 'document-text-outline', route: '/(tabs)/more/reports' },
      { label: 'Files', icon: 'folder-outline', route: '/(tabs)/more/files' },
    ],
  },
  {
    group: 'Connect',
    items: [
      { label: 'Appointments', icon: 'calendar-outline', route: '/(tabs)/more/appointments' },
      { label: 'Community', icon: 'people-outline', route: '/(tabs)/more/community' },
      { label: 'Notifications', icon: 'notifications-outline', route: '/(tabs)/more/notifications' },
      { label: 'Settings', icon: 'settings-outline', route: '/(tabs)/more/settings' },
    ],
  },
];

function initialsOf(name: string): string {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  );
}

export default function MoreIndex() {
  const t = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const name = (user?.user_metadata?.name as string) || user?.email || 'You';

  const confirmSignOut = () => {
    Alert.alert('Sign out?', "You'll need to sign in again to return.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  const onDest = (d: Dest) => {
    if (d.route) router.push(d.route);
    else Alert.alert(d.label, 'This screen is being rebuilt for the app.');
  };

  return (
    <Screen>
      <ScreenScroll>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={[styles.avatar, { backgroundColor: t.colors.surfaceStrong }]}>
            <AppText variant="heading" tone="accent">
              {initialsOf(name)}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="heading">{name}</AppText>
            {user?.email ? (
              <AppText variant="muted" tone="muted" numberOfLines={1}>
                {user.email}
              </AppText>
            ) : null}
          </View>
          <Pressable onPress={() => router.push('/(tabs)/more/settings')} hitSlop={8}>
            <Ionicons name="settings-outline" size={20} color={t.colors.textMuted} />
          </Pressable>
        </Card>

        {SECTIONS.map((section) => (
          <View key={section.group} style={{ gap: spacing.sm }}>
            <Eyebrow>{section.group}</Eyebrow>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {section.items.map((item, i) => (
                <Pressable
                  key={item.label}
                  onPress={() => onDest(item)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: t.colors.border,
                      backgroundColor: pressed ? t.colors.surfaceStrong : 'transparent',
                    },
                  ]}>
                  <Ionicons name={item.icon} size={20} color={t.colors.textMuted} />
                  <AppText variant="body" style={{ flex: 1 }}>
                    {item.label}
                  </AppText>
                  {item.route ? (
                    <Ionicons name="chevron-forward" size={16} color={t.colors.textFaint} />
                  ) : (
                    <View style={[styles.soon, { backgroundColor: t.colors.surfaceStrong }]}>
                      <AppText variant="caption" tone="faint">
                        SOON
                      </AppText>
                    </View>
                  )}
                </Pressable>
              ))}
            </Card>
          </View>
        ))}

        <Pressable
          onPress={confirmSignOut}
          style={({ pressed }) => [
            styles.signOut,
            { borderColor: t.colors.border, backgroundColor: pressed ? t.colors.surfaceStrong : 'transparent' },
          ]}>
          <Ionicons name="log-out-outline" size={18} color={t.colors.danger} />
          <AppText variant="heading" tone="danger">
            Sign out
          </AppText>
        </Pressable>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  soon: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingVertical: 14,
    marginTop: spacing.sm,
  },
});
