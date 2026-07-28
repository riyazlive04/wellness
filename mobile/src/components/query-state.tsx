import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { radius, spacing } from '@/lib/theme';

/**
 * The backend answers @RequireFeature routes with 402 (FeatureLockedException)
 * when the workspace's plan doesn't include that feature. It is NOT a fault —
 * retrying can never help — so it gets its own presentation.
 */
export function isPlanLocked(error: unknown): boolean {
  return error instanceof ApiError && error.status === 402;
}

/** Distinguishes "the server said no" from "we never reached the server". */
function isOffline(error: unknown): boolean {
  return !(error instanceof ApiError);
}

/**
 * Turn a thrown error into something a client can act on.
 *
 * We never surface raw 5xx text, and never the plan-locked message: the server
 * copy names the workspace's plan and says "Upgrade to unlock it", which is
 * meaningless to a client who doesn't own — or pay for — the workspace.
 */
function describe(error: unknown): string {
  if (isOffline(error)) return "We couldn't reach the server. Check your connection and try again.";

  const e = error as ApiError;
  if (e.status === 401) return 'Your session has expired. Sign out and sign in again.';
  if (e.status === 404) return "This isn't available yet.";
  if (e.status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
  return e.message || 'Something went wrong.';
}

export interface QueryErrorProps {
  error: unknown;
  /** Omit to hide the retry action (e.g. nothing to retry). */
  onRetry?: () => void;
  /** Copy for the plan-locked case — name the feature, e.g. "Recipes". */
  lockedFeature?: string;
}

/**
 * Replaces the empty state when a query FAILS.
 *
 * Screens used to render `data ?? []` and fall through to "No results", which
 * reported an empty library when the real answer was a 402, an expired session
 * or an unreachable server. Anything that isn't success now says what happened.
 */
export function QueryError({ error, onRetry, lockedFeature }: QueryErrorProps) {
  const t = useTheme();
  const locked = isPlanLocked(error);

  const icon: keyof typeof Ionicons.glyphMap = locked
    ? 'lock-closed-outline'
    : isOffline(error)
      ? 'cloud-offline-outline'
      : 'alert-circle-outline';

  return (
    <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
      <View style={[styles.badge, { backgroundColor: t.colors.surfaceStrong }]}>
        <Ionicons name={icon} size={24} color={locked ? t.colors.warning : t.colors.danger} />
      </View>

      <AppText variant="heading" style={{ textAlign: 'center' }}>
        {locked ? `${lockedFeature ?? 'This feature'} isn't available` : 'Couldn’t load this'}
      </AppText>

      <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
        {locked
          ? `${lockedFeature ?? 'This feature'} isn’t part of your nutritionist’s current plan. Ask them to enable it for you.`
          : describe(error)}
      </AppText>

      {!locked && onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retry,
            { borderColor: t.colors.border, backgroundColor: pressed ? t.colors.surfaceStrong : 'transparent' },
          ]}>
          <Ionicons name="refresh" size={15} color={t.colors.accent} />
          <AppText variant="caption" tone="accent">
            Try again
          </AppText>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    marginTop: spacing.xs,
  },
});
