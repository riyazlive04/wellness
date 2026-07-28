import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { type ColorValue, Platform, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

function TabBarIcon({ name, color, size }: { name: IoniconName; color: ColorValue; size: number }) {
  return <Ionicons name={name} color={color as string} size={size} />;
}

export default function TabsLayout() {
  const t = useTheme();
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
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: (p) => <TabBarIcon name="home" {...p} /> }}
      />
      <Tabs.Screen
        name="meals"
        options={{ title: 'Meals', tabBarIcon: (p) => <TabBarIcon name="restaurant" {...p} /> }}
      />
      <Tabs.Screen
        name="assistant"
        options={{ title: 'Assistant', tabBarIcon: (p) => <TabBarIcon name="sparkles" {...p} /> }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: 'Progress', tabBarIcon: (p) => <TabBarIcon name="pulse" {...p} /> }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: 'Chat', tabBarIcon: (p) => <TabBarIcon name="chatbubble-ellipses" {...p} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: (p) => <TabBarIcon name="ellipsis-horizontal" {...p} /> }}
      />
    </Tabs>
  );
}
