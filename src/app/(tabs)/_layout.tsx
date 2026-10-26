import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { type ColorValue, Platform, StyleSheet } from 'react-native';

import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

function TabBarIcon({ name, color, size }: { name: IoniconName; color: ColorValue; size: number }) {
  return <Ionicons name={name} color={color as string} size={size} />;
}

export default function TabsLayout() {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // NUSI green, matching the home screen's header.
        tabBarActiveTintColor: '#2f8f46',
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
      <Tabs.Screen
        name="index"
        options={{ title: tr('tabs.today'), tabBarIcon: (p) => <TabBarIcon name="home" {...p} /> }}
      />
      <Tabs.Screen
        name="meals"
        options={{ title: tr('tabs.meals'), tabBarIcon: (p) => <TabBarIcon name="restaurant" {...p} /> }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: tr('tabs.progress'), tabBarIcon: (p) => <TabBarIcon name="pulse" {...p} /> }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: tr('tabs.chat'), tabBarIcon: (p) => <TabBarIcon name="chatbubble-ellipses" {...p} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: tr('tabs.more'), tabBarIcon: (p) => <TabBarIcon name="ellipsis-horizontal" {...p} /> }}
      />
    </Tabs>
  );
}
