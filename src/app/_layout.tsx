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
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { OwnerProvider } from '@/contexts/owner-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { useScope } from '@/hooks/use-scope';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { syncNotificationsNow } from '@/lib/notifications-service';
import { checkForOtaUpdateInBackground } from '@/lib/ota';
import { queryClient } from '@/lib/query-client';
import { spacing } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

/**
 * Declarative auth + lifecycle gate.
 *
 * The signed-in user's server-resolved tier picks the shell — one app, two
 * experiences, one login:
 *   signed out                     → (auth)/login
 *   tier workspace / super_admin   → (owner)   [nutritionist dashboard]
 *   tier unaffiliated              → /practice-setup
 *   tier client:
 *     pending / inactive           → /pending
 *     approved but not onboarded   → /onboarding
 *     ready                        → (tabs)    [client portal]
 *
 * `/me/profile` is a CLIENT endpoint, so it is only fetched for the client
 * tier — a nutritionist has no client row and gating them on it would trap
 * them on the "Couldn't load your profile" screen.
 */
function RootNavigator() {
  const { session, loading, signOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const t = useTheme();

  const scopeQ = useScope();
  const tier = scopeQ.data?.tier ?? null;
  const isStaff = tier === 'workspace' || tier === 'super_admin';
  const isClientTier = tier === 'client';

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
    enabled: !!session && isClientTier,
    retry: 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync().catch(() => {});

    const segs = segments as string[];
    const inAuthGroup = segs[0] === '(auth)';
    const inOwnerGroup = segs[0] === '(owner)';
    const atRoot = segs.length === 0;
    const onPending = segs[0] === 'pending';
    const onOnboarding = segs[0] === 'onboarding';
    const onPracticeSetup = segs[0] === 'practice-setup';
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

    // Wait for the tier before choosing a shell — never guess. Landing a
    // nutritionist in the client portal (or vice versa) is worse than a beat
    // of spinner.
    if (scopeQ.isLoading || scopeQ.isError || !tier) return;

    // ── Nutritionist / staff shell ────────────────────────────────────────
    if (isStaff) {
      if (!inOwnerGroup) router.replace('/(owner)/overview');
      return;
    }

    // A signed-in user with no workspace and no client row: a new practitioner
    // mid-signup. Practice creation lives on the web; say so rather than
    // dead-ending them on a failed /me/profile fetch.
    if (tier === 'unaffiliated') {
      if (!onPracticeSetup) router.replace('/practice-setup');
      return;
    }

    // ── Client portal ─────────────────────────────────────────────────────
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

    if (inAuthGroup || atRoot || onPending || onOnboarding || onPracticeSetup || inOwnerGroup) {
      if (!onPlateVision && !onResetPassword) router.replace('/(tabs)');
    }
  }, [
    session,
    loading,
    segments,
    router,
    tier,
    isStaff,
    scopeQ.isLoading,
    scopeQ.isError,
    profileQ.isLoading,
    profileQ.isError,
    profileQ.data,
  ]);

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

  if (loading || (session && scopeQ.isLoading) || (session && isClientTier && profileQ.isLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.canvas }}>
        <ActivityIndicator color={t.colors.accent} />
      </View>
    );
  }

  const scopeFailed = !!session && (scopeQ.isError || !scopeQ.data);
  const profileFailed = !!session && isClientTier && (profileQ.isError || !profileQ.data);

  if (scopeFailed || profileFailed) {
    const retry = () => void (scopeFailed ? scopeQ.refetch() : profileQ.refetch());
    const busy = scopeFailed ? scopeQ.isFetching : profileQ.isFetching;
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
          {scopeFailed ? "Couldn't load your account" : "Couldn't load your profile"}
        </AppText>
        <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
          {scopeFailed
            ? "Check your connection and try again. You won't enter the app until this succeeds."
            : // Retrying only helps if this is a network blip. When the server
              // has resolved the account as a client but there's no client
              // record behind it, no amount of retrying will fix it — say so,
              // and show what the server actually thinks, so the account can be
              // corrected instead of the user guessing.
              'Your sign-in worked, but this account has no client record on the server. If you meant to sign in as a nutritionist, the account is missing its workspace access — ask an admin to check it, or sign in with a different account.'}
        </AppText>

        {!scopeFailed && scopeQ.data ? (
          <AppText variant="caption" tone="faint" style={{ textAlign: 'center' }} selectable>
            {`Signed in as ${scopeQ.data.email ?? scopeQ.data.userId} · server says: ${scopeQ.data.tier}${
              scopeQ.data.workspaceRole ? ` / ${scopeQ.data.workspaceRole}` : ' / no workspace role'
            }`}
          </AppText>
        ) : null}

        <Pressable
          onPress={retry}
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderRadius: 999,
            backgroundColor: t.colors.accent,
          }}>
          {busy ? (
            <ActivityIndicator color={t.colors.onBrand} />
          ) : (
            <AppText variant="caption" style={{ color: t.colors.onBrand }}>
              Retry
            </AppText>
          )}
        </Pressable>

        {/* Always offer a way out. Without this the screen is a dead end: a
            non-client account can never satisfy the profile fetch, so Retry
            alone traps the user with no option but to clear app data. */}
        <Pressable onPress={() => void signOut()} style={{ paddingVertical: spacing.sm }}>
          <AppText variant="caption" tone="accent">
            Sign out and use a different account
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.canvas } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(owner)" />
        <Stack.Screen name="pending" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="practice-setup" />
        <Stack.Screen name="join/[token]" />
        <Stack.Screen name="plate-vision" options={{ presentation: 'modal' }} />
      </Stack>
      {session ? <ConnectionBanner /> : null}
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
              <OwnerProvider>
                <ThemedStatusBar />
                <RootNavigator />
              </OwnerProvider>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
