/**
 * Nutritionist shell — the owner counterpart to the client portal's (tabs).
 *
 * Four job-shaped destinations get a tab (Overview · Clients · Inbox ·
 * Schedule) and everything else in the nav map reaches the user through More.
 * Tabs the viewer isn't entitled to are removed from the bar entirely rather
 * than shown and 402/403'd — same rule the web sidebar applies.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { type ColorValue, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useOwner } from '@/contexts/owner-context';
import { useTheme } from '@/hooks/use-theme';
import type { IoniconName } from '@/lib/owner/nav';
import { radius } from '@/lib/theme';

function TabBarIcon({
  name,
  color,
  size,
  badge,
}: {
  name: IoniconName;
  color: ColorValue;
  size: number;
  badge?: number;
}) {
  const t = useTheme();
  return (
    <View>
      <Ionicons name={name} color={color as string} size={size} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: t.colors.danger }]}>
          <AppText variant="label" style={{ color: '#fff', fontSize: 9 }}>
            {badge > 99 ? '99+' : badge}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

export default function OwnerTabsLayout() {
  const t = useTheme();
  const { can, hasFeature, badges } = useOwner();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.tabActive,
        tabBarInactiveTintColor: t.colors.tabInactive,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarStyle: {
          position: 'absolute',
          borderTopColor: t.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : t.colors.tabBar,
          elevation: 0,
        },
        tabBarBackground:
          Platform.OS === 'ios'
            ? () => <BlurView tint={t.dark ? 'dark' : 'light'} intensity={40} style={StyleSheet.absoluteFill} />
            : undefined,
      }}>
      {/*
        Named `overview`, not `index`, on purpose. A group index (`(owner)/
        index.tsx`) resolves to `/` — and the app already has two claimants for
        that path (`app/index.tsx` and `(tabs)/index.tsx`). A third made the
        `sirahlife:///` deep link ambiguous and expo-router fell through to
        "Unmatched Route" on cold start. Giving this screen its own segment
        keeps `/` down to the two the client portal has always had.
      */}
      <Tabs.Screen
        name="overview"
        options={{ title: 'Overview', tabBarIcon: (p) => <TabBarIcon name="grid-outline" {...p} /> }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          href: can('clients.read') ? undefined : null,
          tabBarIcon: (p) => <TabBarIcon name="people-outline" badge={badges?.clients} {...p} />,
        }}
      />
      <Tabs.Screen
        name="messaging"
        options={{
          title: 'Inbox',
          href: can('messaging.use') ? undefined : null,
          tabBarIcon: (p) => (
            <TabBarIcon name="chatbubble-ellipses-outline" badge={badges?.messaging} {...p} />
          ),
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: 'Schedule',
          href: hasFeature('appointments') && can('appointments.manage') ? undefined : null,
          tabBarIcon: (p) => <TabBarIcon name="calendar-outline" badge={badges?.appointments} {...p} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: (p) => (
            <TabBarIcon name="ellipsis-horizontal" badge={badges?.notifications} {...p} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
