/**
 * Shared primitives for the nutritionist (owner) surfaces.
 *
 * The client portal's kit (@/components/ui) covers page chrome and typography;
 * this adds the denser, more data-heavy pieces the practice screens need —
 * headers with actions, stat tiles, list rows, segmented tabs, search, sheets
 * and the two gates (permission / plan feature) that keep the UI honest.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '@/components/ui';
import { useOwner } from '@/contexts/owner-context';
import { useTheme } from '@/hooks/use-theme';
import type { IoniconName } from '@/lib/owner/nav';
import type { Feature } from '@/lib/plan-capabilities';
import { brand, font, radius, spacing, status, tintFill } from '@/lib/theme';

/** Bottom padding that clears the owner tab bar on scrollable content. */
export const OWNER_SCROLL_PAD = 110;

/**
 * Soft pastel accents, rotated across rows and tiles so each one gets its own
 * warmth instead of a wall of teal. Same palette and intent as the client
 * portal's More hub — the two halves of the app should feel like one product.
 */
const PALETTE = [brand.teal, brand.blue, '#3FAE88', '#7C6BD6', status.warning] as const;

/** Pastel chip fill — lighter in light mode, stronger in dark to read on ink. */
const chipBg = (color: string, dark: boolean) => color + (dark ? '2E' : '1A');

/**
 * Deterministic tint for a row from its label, so a given row keeps the same
 * colour between renders and screens without every call site passing one.
 */
function autoTint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ─────────────────────────────────────────────────────────── page chrome ────

export interface OwnerHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows a back chevron. Defaults to false (tab roots have nothing to pop). */
  back?: boolean;
  /** Right-aligned actions. */
  actions?: ReactNode;
}

/**
 * Borderless page header in the client portal's voice: a small uppercase
 * eyebrow over a large title, no divider rule. The old version was a bordered
 * app-bar, which is what made these screens read as a shrunken web dashboard.
 */
export function OwnerHeader({ title, subtitle, back, actions }: OwnerHeaderProps) {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(owner)/overview'))}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backChip,
            { backgroundColor: chipBg(brand.teal, t.dark), opacity: pressed ? 0.6 : 1 },
          ]}>
          <Ionicons name="chevron-back" size={19} color={t.colors.primary} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        {subtitle ? (
          <AppText
            variant="label"
            tone="faint"
            numberOfLines={1}
            style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
            {subtitle}
          </AppText>
        ) : null}
        <AppText variant="title" numberOfLines={1}>
          {title}
        </AppText>
      </View>
      {actions ? <View style={styles.headerActions}>{actions}</View> : null}
    </View>
  );
}

/**
 * Full-bleed gradient hero — the focal point the owner screens were missing.
 * Mirrors the client Today screen's "your garden" card: brand gradient, an
 * eyebrow, a big headline, an optional stat strip and progress track.
 */
export function GradientHero({
  eyebrow,
  headline,
  hint,
  badge,
  stats,
  progress,
  progressLabel,
}: {
  eyebrow: string;
  headline: string;
  hint?: string;
  /** Pill in the top-right, e.g. a streak or plan name. */
  badge?: { icon?: IoniconName; label: string };
  /** Up to three headline numbers shown across the bottom. */
  stats?: { label: string; value: string | number }[];
  /** 0..1 — draws a track under the content when provided. */
  progress?: number;
  progressLabel?: string;
}) {
  const t = useTheme();
  const pct = progress === undefined ? null : Math.max(0, Math.min(1, progress));
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <LinearGradient
        colors={t.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: spacing.xl, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }}>
          <AppText
            variant="label"
            tone="onBrand"
            style={{ opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1.4 }}>
            {eyebrow}
          </AppText>
          {badge ? (
            <View style={styles.heroBadge}>
              {badge.icon ? <Ionicons name={badge.icon} size={13} color={t.colors.onBrand} /> : null}
              <AppText variant="caption" tone="onBrand">
                {badge.label}
              </AppText>
            </View>
          ) : null}
        </View>

        <AppText variant="display" tone="onBrand" style={{ fontSize: 26, lineHeight: 32 }}>
          {headline}
        </AppText>

        {hint ? (
          <AppText variant="muted" tone="onBrand" style={{ opacity: 0.9 }}>
            {hint}
          </AppText>
        ) : null}

        {stats?.length ? (
          <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs }}>
            {stats.map((s) => (
              <View key={s.label} style={{ gap: 2 }}>
                <AppText variant="title" tone="onBrand">
                  {s.value}
                </AppText>
                <AppText variant="caption" tone="onBrand" style={{ opacity: 0.8 }}>
                  {s.label}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {pct !== null ? (
          <View style={{ gap: 6 }}>
            {progressLabel ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="caption" tone="onBrand" style={{ opacity: 0.8 }}>
                  {progressLabel}
                </AppText>
                <AppText variant="caption" tone="onBrand" style={{ opacity: 0.8 }}>
                  {Math.round(pct * 100)}%
                </AppText>
              </View>
            ) : null}
            <View style={styles.heroTrack}>
              <View
                style={{
                  width: `${pct * 100}%`,
                  height: '100%',
                  backgroundColor: t.colors.onBrand,
                  borderRadius: 999,
                }}
              />
            </View>
          </View>
        ) : null}
      </LinearGradient>
    </Card>
  );
}

/** Circular icon button for header actions. */
export function IconButton({
  icon,
  onPress,
  tone = 'default',
  badge,
  accessibilityLabel,
}: {
  icon: IoniconName;
  onPress?: () => void;
  tone?: 'default' | 'accent' | 'danger';
  /** Small count bubble, hidden when 0/undefined. */
  badge?: number;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const color =
    tone === 'accent' ? t.colors.accent : tone === 'danger' ? t.colors.danger : t.colors.text;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.iconBtn,
        { backgroundColor: pressed ? t.colors.surfaceStrong : 'transparent' },
      ]}>
      <Ionicons name={icon} size={21} color={color} />
      {badge ? (
        <View style={[styles.iconBadge, { backgroundColor: t.colors.danger }]}>
          <AppText variant="label" style={{ color: '#fff', fontSize: 9 }}>
            {badge > 99 ? '99+' : badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Standard owner page frame: safe area + header + scrollable body. */
export function OwnerPage({
  title,
  subtitle,
  back,
  actions,
  children,
  scroll = true,
  refreshControl,
  contentStyle,
}: OwnerHeaderProps & {
  children: ReactNode;
  /** Set false when the body manages its own scrolling (e.g. a FlatList). */
  scroll?: boolean;
  refreshControl?: React.ReactElement<any>;
  contentStyle?: ViewProps['style'];
}) {
  return (
    <Screen>
      <OwnerHeader title={title} subtitle={subtitle} back={back} actions={actions} />
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          contentContainerStyle={[
            { padding: spacing.lg, paddingBottom: OWNER_SCROLL_PAD, gap: spacing.lg },
            contentStyle,
          ]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
    </Screen>
  );
}

// ────────────────────────────────────────────────────────────── data bits ────

/** Compact KPI tile. Use in a 2-up or 3-up row. */
export function StatTile({
  label,
  value,
  delta,
  icon,
  tint,
  onPress,
}: {
  label: string;
  value: string | number;
  /** Signed change, e.g. +12% — coloured by sign. */
  delta?: string;
  icon?: IoniconName;
  tint?: string;
  onPress?: () => void;
}) {
  const t = useTheme();
  // Every tile gets a soft pastel identity rather than a flat white card with
  // grey text — the thing that made these read as spreadsheet cells.
  const accent = tint ?? autoTint(label);
  const down = typeof delta === 'string' && delta.trim().startsWith('-');
  const body = (
    <View style={{ gap: spacing.sm }}>
      {icon ? (
        <View style={[styles.tileChip, { backgroundColor: chipBg(accent, t.dark) }]}>
          <Ionicons name={icon} size={17} color={accent} />
        </View>
      ) : null}
      <View style={{ gap: 1 }}>
        <AppText variant="title">{value}</AppText>
        <AppText variant="caption" tone="muted" numberOfLines={2}>
          {label}
        </AppText>
      </View>
      {delta ? (
        <AppText variant="caption" tone={down ? 'danger' : 'success'}>
          {delta}
        </AppText>
      ) : null}
    </View>
  );
  return (
    <Card
      style={{
        flex: 1,
        minWidth: 96,
        padding: spacing.lg,
        borderRadius: radius.xl,
        backgroundColor: tintFill(accent, t.dark),
      }}>
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          {body}
        </Pressable>
      ) : (
        body
      )}
    </Card>
  );
}

/** Equal-width row of tiles that wraps. */
export function TileRow({ children }: { children: ReactNode }) {
  return <View style={styles.tileRow}>{children}</View>;
}

/** Tappable list row — the workhorse of every owner list screen. */
export function ListRow({
  title,
  subtitle,
  meta,
  icon,
  avatarText,
  tint,
  badge,
  right,
  onPress,
  danger,
}: {
  title: string;
  subtitle?: string | null;
  /** Right-aligned secondary text (time, count, amount). */
  meta?: string | null;
  icon?: IoniconName;
  /** Initials bubble, used when there is no icon. */
  avatarText?: string;
  tint?: string;
  /** Unread-style count bubble. */
  badge?: number;
  /** Custom trailing node; replaces the chevron. */
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const t = useTheme();
  // Rows are rounded, self-spaced and divider-free — the hairline separators
  // were what made these lists look like an HTML table on a phone. Each row
  // carries its own pastel chip, tinted from its title when not specified.
  const accent = danger ? t.colors.danger : (tint ?? autoTint(title));
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed && onPress ? t.colors.surfaceStrong : 'transparent' },
      ]}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: chipBg(accent, t.dark) }]}>
          <Ionicons name={icon} size={19} color={accent} />
        </View>
      ) : avatarText ? (
        <View style={[styles.rowIcon, { backgroundColor: chipBg(accent, t.dark) }]}>
          <AppText variant="caption" style={{ color: accent }}>
            {avatarText.slice(0, 2).toUpperCase()}
          </AppText>
        </View>
      ) : null}

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText variant="body" numberOfLines={1} tone={danger ? 'danger' : 'text'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="muted" tone="muted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {meta ? (
        <AppText variant="caption" tone="faint" numberOfLines={1}>
          {meta}
        </AppText>
      ) : null}

      {badge ? (
        <View style={[styles.countBubble, { backgroundColor: t.colors.accent }]}>
          <AppText variant="label" style={{ color: t.colors.onBrand, fontSize: 10 }}>
            {badge > 99 ? '99+' : badge}
          </AppText>
        </View>
      ) : null}

      {right ?? (onPress ? <Ionicons name="chevron-forward" size={17} color={t.colors.textFaint} /> : null)}
    </Pressable>
  );
}

/** Coloured status pill. */
export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  const t = useTheme();
  const color = {
    neutral: t.colors.textMuted,
    success: t.colors.success,
    warning: t.colors.warning,
    danger: t.colors.danger,
    accent: t.colors.accent,
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: tintFill(color, t.dark), borderColor: color + '55' }]}>
      <AppText variant="label" style={{ color }}>
        {label}
      </AppText>
    </View>
  );
}

/** Horizontal segmented control — the mobile stand-in for the web's tab bars. */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; badge?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  const t = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[
              styles.segment,
              {
                backgroundColor: active ? t.colors.accent : t.colors.surfaceStrong,
                borderColor: active ? t.colors.accent : t.colors.border,
              },
            ]}>
            <AppText variant="caption" style={{ color: active ? t.colors.onBrand : t.colors.textMuted }}>
              {o.label}
              {o.badge ? ` · ${o.badge}` : ''}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Debounce-friendly search box (caller owns the debounce). */
export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
  ...rest
}: TextInputProps & { value: string; onChangeText: (v: string) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border }]}>
      <Ionicons name="search" size={16} color={t.colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.colors.textFaint}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        {...rest}
        // Same merge fix as Field — rest must not be able to blank the style.
        style={[{ flex: 1, color: t.colors.text, fontSize: font.size.base, paddingVertical: 0 }, rest.style]}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10}>
          <Ionicons name="close-circle" size={16} color={t.colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Labelled text input for forms. */
export function Field({
  label,
  hint,
  style,
  ...rest
}: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      <TextInput
        placeholderTextColor={t.colors.textFaint}
        {...rest}
        // `style` is pulled out of rest and MERGED, not spread over the top.
        // Spreading rest last let a caller's `style` (every multiline field
        // passes one for minHeight) replace the whole object — those inputs
        // rendered with no fill, border or padding at all.
        style={[
          {
            backgroundColor: t.colors.surfaceStrong,
            borderColor: t.colors.border,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            color: t.colors.text,
            fontSize: font.size.base,
          },
          style,
        ]}
      />
      {hint ? (
        <AppText variant="caption" tone="faint">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/** Neutral empty state for lists that loaded fine but have nothing in them. */
export function EmptyState({
  icon = 'file-tray-outline',
  title,
  body,
  action,
}: {
  icon?: IoniconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
      <View style={[styles.emptyIcon, { backgroundColor: t.colors.surfaceStrong }]}>
        <Ionicons name={icon} size={22} color={t.colors.textFaint} />
      </View>
      <AppText variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
          {body}
        </AppText>
      ) : null}
      {action}
    </Card>
  );
}

/** Section wrapper with an eyebrow heading and optional trailing action. */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
          {title}
        </AppText>
        {action}
      </View>
      {children}
    </View>
  );
}

/** Bottom sheet built on RN Modal — no extra dependency. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: t.colors.canvas,
            borderColor: t.colors.border,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}>
        <View style={[styles.grabber, { backgroundColor: t.colors.border }]} />
        {title ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
            <AppText variant="heading" style={{ flex: 1 }}>
              {title}
            </AppText>
            <IconButton icon="close" onPress={onClose} accessibilityLabel="Close" />
          </View>
        ) : null}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.md }}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Full-width solid button (denser than the client portal's gradient CTA). */
export function ActionButton({
  label,
  onPress,
  icon,
  tone = 'accent',
  loading,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  icon?: IoniconName;
  tone?: 'accent' | 'neutral' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  const off = disabled || loading;
  const fg = tone === 'neutral' ? t.colors.text : t.colors.onBrand;

  const inner = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <>
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <AppText variant="heading" style={{ color: fg }}>
        {label}
      </AppText>
    </>
  );

  // The primary action uses the brand gradient, matching the client portal's
  // "Log a meal" CTA. A flat teal fill read as a web <button>.
  if (tone === 'accent') {
    return (
      <Pressable
        onPress={onPress}
        disabled={off}
        style={({ pressed }) => ({ opacity: off ? 0.55 : pressed ? 0.9 : 1 })}>
        <LinearGradient
          colors={t.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.actionBtn}>
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.actionBtn,
        tone === 'danger'
          ? { backgroundColor: t.colors.danger }
          : {
              backgroundColor: pressed ? t.colors.surfaceStrong : 'transparent',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: t.colors.border,
            },
        { opacity: off ? 0.55 : 1 },
      ]}>
      {inner}
    </Pressable>
  );
}

/** Inline spinner block for in-page loading. */
export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
      <ActivityIndicator color={t.colors.accent} />
      {label ? (
        <AppText variant="caption" tone="faint">
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────  gates ────

/**
 * Hides children unless the viewer holds `permission`. Owners and super admins
 * pass everything. Mirrors the web's permission-driven UI gating; the backend
 * enforces the same rule independently.
 */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission?: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useOwner();
  return <>{can(permission) ? children : fallback}</>;
}

/** Whole-page gate: renders a clear "not available" card instead of a 402/403. */
export function RouteGate({
  permission,
  feature,
  featureLabel,
  children,
}: {
  permission?: string;
  feature?: Feature;
  featureLabel?: string;
  children: ReactNode;
}) {
  const { can, hasFeature } = useOwner();

  if (feature && !hasFeature(feature)) {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title={`${featureLabel ?? 'This feature'} isn't in your plan`}
        body="Upgrade your subscription to unlock it. You can change plans from Billing, or on the web."
      />
    );
  }
  if (!can(permission)) {
    return (
      <EmptyState
        icon="shield-outline"
        title="You don't have access"
        body="Your workspace owner controls who can open this. Ask them to grant the permission."
      />
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  backChip: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  heroTrack: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  tileChip: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconBadge: {
    position: 'absolute',
    top: 3,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Self-spacing + rounded so a row still looks right inside the `padding: 0`
  // Cards the screens already wrap them in — no call-site changes needed.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.xs,
    marginVertical: 1,
    borderRadius: radius.lg,
  },
  rowIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  countBubble: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.pill,
  },
});
