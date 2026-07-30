import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { brand, radius, spacing, status } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Dest {
  label: string;
  icon: IoniconName;
  route?: Href;
}

// Soft pastel accent palette — rotated across menu items so each row gets its
// own warmth (matching the polished Today/Progress screens). Teal, cyan,
// emerald, violet, amber.
const PALETTE = [brand.teal, brand.blue, '#3FAE88', '#7C6BD6', status.warning] as const;

// Soft pastel fill alphas: lighter in light mode, a touch stronger in dark so
// the tint reads on the ink canvas.
const chipBg = (color: string, dark: boolean) => color + (dark ? '2E' : '1A'); // ~0.18 / ~0.10

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
      { label: 'Meal plan', icon: 'calendar-outline', route: '/(tabs)/more/meal-plan' },
      { label: 'Goals', icon: 'flag-outline', route: '/(tabs)/more/goals' },
      { label: 'Programs', icon: 'clipboard-outline', route: '/(tabs)/more/programs' },
      { label: 'Assessments', icon: 'checkbox-outline', route: '/(tabs)/more/assessments' },
      { label: 'Timeline', icon: 'time-outline', route: '/(tabs)/more/timeline' },
    ],
  },
  {
    group: 'Library & records',
    items: [
      { label: 'Food lookup', icon: 'search-outline', route: '/(tabs)/more/foods' },
      { label: 'Barcode scan', icon: 'scan-outline', route: '/(tabs)/more/barcode' },
      { label: 'Recipes', icon: 'book-outline', route: '/(tabs)/more/recipes' },
      { label: 'Supplements', icon: 'medkit-outline', route: '/(tabs)/more/supplements' },
      { label: 'Measurements', icon: 'resize-outline', route: '/(tabs)/more/measurements' },
      { label: 'Progress photos', icon: 'images-outline', route: '/(tabs)/more/photos' },
      { label: 'Reports', icon: 'document-text-outline', route: '/(tabs)/more/reports' },
      { label: 'Files', icon: 'folder-outline', route: '/(tabs)/more/files' },
    ],
  },
  {
    group: 'Shop',
    items: [{ label: 'Shop', icon: 'bag-outline', route: '/(tabs)/more/shop' }],
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

  // Running counter so tints rotate continuously across all items, not just
  // within a section.
  let tintIndex = 0;

  return (
    <Screen>
      <ScreenScroll contentContainerStyle={{ paddingBottom: 110 }}>
        {/* ── Profile header ──────────────────────────────────────── */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View style={styles.profileRow}>
            <LinearGradient
              colors={t.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}>
              <AppText variant="heading" tone="onBrand">
                {initialsOf(name)}
              </AppText>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <AppText variant="heading" numberOfLines={1}>
                {name}
              </AppText>
              {user?.email ? (
                <AppText variant="muted" tone="muted" numberOfLines={1}>
                  {user.email}
                </AppText>
              ) : null}
            </View>
            <Pressable
              onPress={() => router.push('/(tabs)/more/settings')}
              hitSlop={8}
              style={({ pressed }) => [
                styles.settingsChip,
                {
                  backgroundColor: chipBg(brand.teal, t.dark),
                  opacity: pressed ? 0.6 : 1,
                },
              ]}>
              <Ionicons name="settings-outline" size={18} color={t.colors.primary} />
            </Pressable>
          </View>
        </Card>

        {SECTIONS.map((section) => (
          <View key={section.group} style={{ gap: spacing.sm }}>
            <Eyebrow>{section.group}</Eyebrow>
            <Card style={{ padding: spacing.xs, gap: 2 }}>
              {section.items.map((item) => {
                const tint = PALETTE[tintIndex++ % PALETTE.length];
                return (
                  <Pressable
                    key={item.label}
                    onPress={() => onDest(item)}
                    style={({ pressed }) => [
                      styles.row,
                      { backgroundColor: pressed ? t.colors.surfaceStrong : 'transparent' },
                    ]}>
                    <View style={[styles.chip, { backgroundColor: chipBg(tint, t.dark) }]}>
                      <Ionicons name={item.icon} size={19} color={tint} />
                    </View>
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
                );
              })}
            </Card>
          </View>
        ))}

        <Pressable
          onPress={confirmSignOut}
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
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsChip: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.lg,
  },
  chip: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
