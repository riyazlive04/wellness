import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Honest placeholder for a client-portal screen that hasn't been ported to
 * native yet. Keeps the tab navigable while the rewrite proceeds screen by
 * screen.
 */
export function ComingSoon({
  title,
  icon = 'sparkles-outline',
  note = 'This screen is being rebuilt for the app.',
}: {
  title: string;
  icon?: IoniconName;
  note?: string;
}) {
  const t = useTheme();
  return (
    <Screen>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xl,
          gap: spacing.md,
        }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.colors.surfaceStrong,
          }}>
          <Ionicons name={icon} size={30} color={t.colors.accent} />
        </View>
        <AppText variant="title">{title}</AppText>
        <AppText variant="body" tone="muted" style={{ textAlign: 'center', maxWidth: 280 }}>
          {note}
        </AppText>
      </View>
    </Screen>
  );
}
