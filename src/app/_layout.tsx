import 'react-native-url-polyfill/auto';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { ConnectionBanner } from '@/components/connection-banner';
// Side-effect import: defines the background poll task + foreground handler.
import { syncNotificationsNow } from '@/lib/notifications-service';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { useTheme } from '@/hooks/use-theme';
import { queryClient } from '@/lib/query-client';

SplashScreen.preventAutoHideAsync();

/**
 * Declarative auth gate: redirect between the (auth) and (tabs) groups off the
 * session. This is the idiomatic expo-router pattern — no navigation calls live
 * inside the AuthContext.
 */
function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const t = useTheme();

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync().catch(() => {});
    // Typed-routes narrows segments to route literals; treat as plain strings.
    const segs = segments as string[];
    const inAuthGroup = segs[0] === '(auth)';
    const atRoot = segs.length === 0; // the root index splash
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && (inAuthGroup || atRoot)) {
      // Signed in on the login screen or the boot splash → into the tabs.
      // (Other authed routes like /plate-vision are left alone.)
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  // Check for new notifications on launch and whenever the app is foregrounded.
  useEffect(() => {
    if (!session) return;
    void syncNotificationsNow();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNotificationsNow();
    });
    return () => sub.remove();
  }, [session]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.canvas }}>
        <ActivityIndicator color={t.colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.canvas } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="plate-vision" options={{ presentation: 'modal' }} />
      </Stack>
      {/* Server-unreachable banner — only over the signed-in app shell. */}
      {session ? <ConnectionBanner /> : null}
    </View>
  );
}

/** Status bar contrast follows the active (user-chosen) theme. */
function ThemedStatusBar() {
  const t = useTheme();
  return <StatusBar style={t.dark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ThemedStatusBar />
              <RootNavigator />
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
