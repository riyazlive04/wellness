import 'react-native-url-polyfill/auto';

import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, Pressable, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConnectionBanner } from '@/components/connection-banner';
import { AppText } from '@/components/ui';
import { UpdatePrompt } from '@/components/update-prompt';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { syncNotificationsNow } from '@/lib/notifications-service';
import { checkForOtaUpdateInBackground } from '@/lib/ota';
import { queryClient } from '@/lib/query-client';
import { spacing } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

/**
 * Declarative auth + client-lifecycle gate:
 *   signed out → (auth)/login
 *   pending / inactive → /pending
 *   approved but not onboarded → /onboarding
 *   ready → (tabs)
 */
function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const t = useTheme();

  const profileQ = useQuery({
    queryKey: ['me', 'profile'],
    // Race the fetch against a hard timeout so a stalled connection surfaces the
    // retry UI instead of trapping the user on the loading screen forever. A
    // hung fetch (no OS-level timeout) would otherwise keep isLoading true
    // indefinitely — the failure the slow-network incident exposed.
    queryFn: () =>
      Promise.race([
        clientsApi.myProfile(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timed out reaching the server. Check your connection.')), 20_000),
        ),
      ]),
    enabled: !!session,
    retry: 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync().catch(() => {});

    const segs = segments as string[];
    const inAuthGroup = segs[0] === '(auth)';
    const atRoot = segs.length === 0;
    const onPending = segs[0] === 'pending';
    const onOnboarding = segs[0] === 'onboarding';
    const onPlateVision = segs[0] === 'plate-vision';
    const onJoin = segs[0] === 'join';
    const onResetPassword = inAuthGroup && segs[1] === 'reset-password';

    if (!session) {
      // Join invite + auth screens are reachable while signed out.
      if (onJoin || inAuthGroup) return;
      router.replace('/(auth)/login');
      return;
    }

    // Recovery / join flows keep their own screens even with a session.
    if (onJoin || onResetPassword) return;

    // Wait for a successful profile load before lifecycle routing. Never
    // fail-open into tabs — that would skip pending / onboarding gates.
    if (profileQ.isLoading || profileQ.isError || !profileQ.data) return;

    const profile = profileQ.data;
    const status = profile.status ?? null;
    const needsApproval = status === 'pending' || status === 'inactive';
    const needsOnboarding = !profile.onboarded_at && !needsApproval;

    if (needsApproval) {
      if (!onPending) router.replace('/pending');
      return;
    }
    if (needsOnboarding) {
      if (!onOnboarding) router.replace('/onboarding');
      return;
    }

    if (inAuthGroup || atRoot || onPending || onOnboarding) {
      if (!onPlateVision && !onResetPassword) router.replace('/(tabs)');
    }
  }, [session, loading, segments, router, profileQ.isLoading, profileQ.isError, profileQ.data]);

  useEffect(() => {
    if (!session) return;
    void syncNotificationsNow();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNotificationsNow();
    });
    return () => sub.remove();
  }, [session]);

  // Check for an OTA update only AFTER the app is up and the initial data has
  // loaded — never at launch. On a slow connection the update download must not
  // compete with the auth/profile calls that gate the loading screen (that's
  // what stalled v1.0.6 on the logo). Deferred well past first paint.
  useEffect(() => {
    if (!session || profileQ.isLoading) return;
    const id = setTimeout(() => void checkForOtaUpdateInBackground(), 8000);
    return () => clearTimeout(id);
  }, [session, profileQ.isLoading]);

  if (loading || (session && profileQ.isLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.canvas }}>
        <ActivityIndicator color={t.colors.accent} />
      </View>
    );
  }

  if (session && (profileQ.isError || !profileQ.data)) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.colors.canvas,
          paddingHorizontal: spacing.xl,
          gap: spacing.md,
        }}>
        <AppText variant="heading" style={{ textAlign: 'center' }}>
          {"Couldn't load your profile"}
        </AppText>
        <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
          {"Check your connection and try again. You won't enter the app until this succeeds."}
        </AppText>
        <Pressable
          onPress={() => void profileQ.refetch()}
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderRadius: 999,
            backgroundColor: t.colors.accent,
          }}>
          {profileQ.isFetching ? (
            <ActivityIndicator color={t.colors.onBrand} />
          ) : (
            <AppText variant="caption" style={{ color: t.colors.onBrand }}>
              Retry
            </AppText>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.canvas } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="pending" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="join/[token]" />
        <Stack.Screen name="plate-vision" options={{ presentation: 'modal' }} />
      </Stack>
      {session ? <ConnectionBanner /> : null}
      {session ? <UpdatePrompt /> : null}
    </View>
  );
}

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
