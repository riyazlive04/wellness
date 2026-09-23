/**
 * The bottom tab bar — order, labels and icons come from the server.
 *
 * Two expo-router constraints shape this file:
 *
 *  1. EVERY tab route must be declared. expo-router auto-discovers screen files
 *     that a layout does not mention, so simply omitting a hidden tab would put
 *     it back in the bar with a default title. Hidden tabs are therefore
 *     declared with `href: null`, which drops them from the bar while leaving
 *     the route mounted.
 *
 *  2. A hidden tab's route must stay REACHABLE. Deep links, push notifications
 *     and in-app `router.push` calls all target these paths, and a notification
 *     that opens a dead route is worse than a tab the practice wanted hidden.
 *     `href: null` keeps navigation working; it only removes the button.
 *
 * Tab order follows the order of the `tab` nodes in the layout, because
 * expo-router renders the bar in declaration order.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useMemo } from 'react';
import { type ColorValue, Platform, StyleSheet } from 'react-native';

import { useScreen } from '@/contexts/sdui-context';
import { useTheme } from '@/hooks/use-theme';
import { interpolate } from '@/lib/sdui/bindings';
import type { UiNode } from '@/lib/sdui/types';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Every screen file under app/(tabs). Must stay in step with the directory. */
const ALL_TAB_ROUTES = ['index', 'meals', 'assistant', 'progress', 'chat', 'more'] as const;

/** Used when a tab node names a route but the layout omits an icon. */
const FALLBACK_ICONS: Record<string, IoniconName> = {
  index: 'home',
  meals: 'restaurant',
  assistant: 'sparkles',
  progress: 'pulse',
  chat: 'chatbubble-ellipses',
  more: 'ellipsis-horizontal',
};

interface VisibleTab {
  route: string;
  label: string;
  icon: IoniconName;
}

function TabBarIcon({ name, color, size }: { name: IoniconName; color: ColorValue; size: number }) {
  return <Ionicons name={name} color={color as string} size={size} />;
}

/** Depth-first walk collecting `tab` nodes in document order. */
function collectTabs(node: UiNode | undefined, out: VisibleTab[]): void {
  if (!node || typeof node.type !== 'string') return;

  if (node.type === 'tab') {
    if (!ALL_TAB_ROUTES.includes(node.route as (typeof ALL_TAB_ROUTES)[number])) return;
    if (out.some((t) => t.route === node.route)) return;
    out.push({
      route: node.route,
      label: interpolate(node.label, {}) || node.route,
      icon: (node.icon as IoniconName) || FALLBACK_ICONS[node.route] || 'ellipse',
    });
    return;
  }

  const children = (node as { children?: UiNode[] }).children;
  if (Array.isArray(children)) children.forEach((c) => collectTabs(c, out));
}

export default function TabsLayout() {
  const t = useTheme();
  const screen = useScreen('tabs');

  const visible = useMemo(() => {
    const found: VisibleTab[] = [];
    collectTabs(screen.root, found);

    // A layout with no usable tabs would leave the app with no navigation at
    // all. The server's validator already refuses to publish one, so this only
    // fires on a corrupt cache — but "no way to move around the app" is not a
    // state worth risking on that assumption.
    if (!found.length) {
      return ALL_TAB_ROUTES.map((route) => ({
        route,
        label: route === 'index' ? 'Today' : route[0].toUpperCase() + route.slice(1),
        icon: FALLBACK_ICONS[route],
      }));
    }

    // Same reasoning for the way home specifically.
    if (!found.some((tab) => tab.route === 'index')) {
      found.unshift({ route: 'index', label: 'Today', icon: FALLBACK_ICONS.index });
    }
    return found;
  }, [screen]);

  const hidden = ALL_TAB_ROUTES.filter((r) => !visible.some((v) => v.route === r));

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
            ? () => (
                <BlurView
                  tint={t.dark ? 'dark' : 'light'}
                  intensity={40}
                  style={StyleSheet.absoluteFill}
                />
              )
            : undefined,
      }}>
      {visible.map((tab) => (
        <Tabs.Screen
          key={tab.route}
          name={tab.route}
          options={{
            title: tab.label,
            tabBarIcon: (p) => <TabBarIcon name={tab.icon} {...p} />,
          }}
        />
      ))}

      {/* Declared but not shown — keeps the route mounted and linkable. */}
      {hidden.map((route) => (
        <Tabs.Screen key={route} name={route} options={{ href: null }} />
      ))}
    </Tabs>
  );
}
