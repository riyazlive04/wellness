import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function MoreLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.colors.canvas },
        headerTintColor: t.colors.text,
        headerTitleStyle: { color: t.colors.text, fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: t.colors.canvas },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="habits" options={{ title: 'Habits' }} />
      <Stack.Screen name="journal" options={{ title: 'Journal' }} />
      <Stack.Screen name="goals" options={{ title: 'Goals' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="wellbeing" options={{ title: 'Wellbeing' }} />
      <Stack.Screen name="achievements" options={{ title: 'Achievements' }} />
      <Stack.Screen name="cycle" options={{ title: 'Cycle' }} />
      <Stack.Screen name="programs" options={{ title: 'Programs' }} />
      <Stack.Screen name="assessments" options={{ title: 'Assessments' }} />
      <Stack.Screen name="timeline" options={{ title: 'Timeline' }} />
      <Stack.Screen name="recipes" options={{ title: 'Recipes' }} />
      <Stack.Screen name="supplements" options={{ title: 'Supplements' }} />
      <Stack.Screen name="reports" options={{ title: 'Reports' }} />
      <Stack.Screen name="files" options={{ title: 'Files' }} />
      <Stack.Screen name="appointments" options={{ title: 'Appointments' }} />
      <Stack.Screen name="meeting/[id]" options={{ title: 'Video call', headerShown: false }} />
      <Stack.Screen name="community" options={{ title: 'Community' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="meal-plan" options={{ title: 'Meal plan' }} />
      <Stack.Screen name="measurements" options={{ title: 'Measurements' }} />
      <Stack.Screen name="foods" options={{ title: 'Food lookup' }} />
      <Stack.Screen name="barcode" options={{ title: 'Barcode scan' }} />
      <Stack.Screen name="photos" options={{ title: 'Progress photos' }} />
      <Stack.Screen name="program/[id]" options={{ title: 'Program' }} />
      <Stack.Screen name="assessment/[id]" options={{ title: 'Assessment' }} />
      <Stack.Screen name="shop" options={{ title: 'Shop' }} />
    </Stack>
  );
}
