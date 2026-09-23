/**
 * Server-driven UI — the renderer.
 *
 * Turns a validated node tree into React Native elements using the app's own
 * primitives, so a server-driven screen is pixel-identical to a hand-written
 * one: same Card, same AppText variants, same theme tokens. Nothing here draws
 * raw colours or ad-hoc type scales, because the whole value of the design
 * system evaporates the moment a JSON payload can bypass it.
 *
 * Three robustness rules, each earning its keep:
 *
 *  1. An unknown node type renders NOTHING rather than throwing. An old binary
 *     must survive a server that has learned a new node type.
 *  2. Every direct child of the root is wrapped in an error boundary. One bad
 *     node loses its own card, not the whole screen.
 *  3. Conditions and bindings that fail to resolve read as absent, never as a
 *     crash — missing data is the normal case on a cold start, not an error.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Component, type ReactElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScoreRing } from '@/components/score-ring';
import { TrendChart } from '@/components/trend-chart';
import { AppText, Card, Eyebrow, GhostButton, GradientButton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import type { RunAction } from '@/lib/sdui/actions';
import { evaluate, interpolate, resolveArray, resolveNumber, type Scope } from '@/lib/sdui/bindings';
import type { SpaceToken, Tone, UiNode } from '@/lib/sdui/types';
import { radius, spacing } from '@/lib/theme';

import { NATIVE_BLOCKS } from './natives';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Schema space tokens → the app's spacing scale. */
const SPACE: Record<SpaceToken, number> = {
  none: 0,
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
  '2xl': spacing['2xl'],
  '3xl': spacing['3xl'],
};

const RADIUS: Record<SpaceToken, number> = {
  none: 0,
  xs: 4,
  sm: radius.sm,
  md: radius.md,
  lg: radius.lg,
  xl: radius.xl,
  '2xl': radius['2xl'],
  '3xl': radius['2xl'],
};

const FLEX_ALIGN = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
} as const;

const FLEX_JUSTIFY = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
} as const;

export interface RenderProps {
  node: UiNode;
  scope: Scope;
  run: RunAction;
  /** Position among siblings — `row` uses it to skip its leading separator. */
  index?: number;
}

/** Render a list of children, threading each one's sibling index. */
function renderChildren(nodes: UiNode[] | undefined, scope: Scope, run: RunAction): ReactNode {
  if (!nodes?.length) return null;
  return nodes.map((child, i) => (
    <SduiNode key={child.id ?? i} node={child} scope={scope} run={run} index={i} />
  ));
}

export function SduiNode({ node, scope, run, index = 0 }: RenderProps): ReactElement | null {
  const t = useTheme();

  // A node may be absent for this user — the common case, not a failure.
  if (!node || typeof node.type !== 'string') return null;
  if (!evaluate(node.when, scope)) return null;

  switch (node.type) {
    // ── Structure ────────────────────────────────────────────────
    case 'stack': {
      const row = node.direction === 'row';
      return (
        <View
          style={{
            flexDirection: row ? 'row' : 'column',
            gap: SPACE[node.gap ?? 'md'],
            padding: SPACE[node.padding ?? 'none'],
            alignItems: node.align ? FLEX_ALIGN[node.align] : undefined,
            justifyContent: node.justify ? FLEX_JUSTIFY[node.justify] : undefined,
            flexWrap: node.wrap ? 'wrap' : 'nowrap',
          }}>
          {renderChildren(node.children, scope, run)}
        </View>
      );
    }

    case 'card': {
      const pad = SPACE[node.padding ?? 'lg'];
      return (
        <Card
          style={{
            padding: pad,
            // Zero padding means this card is a list container; clip so the
            // rows' separators stay inside the rounded corners.
            overflow: pad === 0 ? 'hidden' : undefined,
            gap: pad === 0 ? 0 : spacing.sm,
          }}>
          {renderChildren(node.children, scope, run)}
        </Card>
      );
    }

    case 'section':
      return (
        <View style={{ gap: spacing.sm }}>
          {node.title ? <Eyebrow>{interpolate(node.title, scope)}</Eyebrow> : null}
          {renderChildren(node.children, scope, run)}
        </View>
      );

    case 'spacer':
      return <View style={{ height: SPACE[node.size ?? 'md'] }} />;

    case 'divider':
      return (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: t.colors.border,
          }}
        />
      );

    // ── Content ──────────────────────────────────────────────────
    case 'text': {
      const value = interpolate(node.value, scope);
      // An empty interpolation means the data is missing; an empty Text node
      // would still occupy line-height and leave a mystery gap.
      if (!value.trim()) return null;
      return (
        <AppText
          variant={node.variant ?? 'body'}
          tone={node.tone ?? 'text'}
          numberOfLines={node.lines}
          style={node.align ? { textAlign: node.align } : undefined}>
          {value}
        </AppText>
      );
    }

    case 'icon':
      return (
        <Ionicons
          name={node.name as IoniconName}
          size={node.size ?? 20}
          color={toneColor(t, node.tone ?? 'muted')}
        />
      );

    case 'image': {
      const url = interpolate(node.url, scope).trim();
      if (!/^https:\/\//i.test(url)) return null;
      return (
        <Image
          source={{ uri: url }}
          style={{
            width: '100%',
            height: node.height ?? 160,
            borderRadius: RADIUS[node.radius ?? 'lg'],
          }}
          contentFit={node.mode ?? 'cover'}
          transition={150}
        />
      );
    }

    case 'badge': {
      const value = interpolate(node.value, scope);
      if (!value.trim()) return null;
      return (
        <View
          style={[styles.badge, { backgroundColor: t.colors.surfaceStrong }]}>
          <AppText variant="caption" tone={node.tone ?? 'accent'}>
            {value}
          </AppText>
        </View>
      );
    }

    case 'progress': {
      const value = resolveNumber(node.value, scope, 0);
      const max = node.max ?? 100;
      const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
      return (
        <View style={[styles.track, { backgroundColor: t.colors.surfaceStrong }]}>
          <View
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              backgroundColor: toneColor(t, node.tone ?? 'accent'),
              borderRadius: 999,
            }}
          />
        </View>
      );
    }

    case 'ring': {
      const value = resolveNumber(node.value, scope, 0);
      return (
        <View style={{ alignItems: 'center', gap: spacing.xs }}>
          <ScoreRing
            score={value > 0 ? value : null}
            label={node.label ? interpolate(node.label, scope) : undefined}
          />
          {node.caption ? (
            <AppText variant="caption" tone="muted">
              {interpolate(node.caption, scope)}
            </AppText>
          ) : null}
        </View>
      );
    }

    case 'chart': {
      const raw = resolveArray(node.points, scope);
      const values = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
      return (
        <View style={{ gap: spacing.xs }}>
          {node.label ? <Eyebrow>{interpolate(node.label, scope)}</Eyebrow> : null}
          <TrendChart values={values} />
        </View>
      );
    }

    // ── Interactive ──────────────────────────────────────────────
    case 'button': {
      const label = interpolate(node.label, scope);
      const onPress = () => run(node.action, scope);
      return node.variant === 'ghost' ? (
        <GhostButton label={label} onPress={onPress} />
      ) : (
        <GradientButton label={label} onPress={onPress} />
      );
    }

    case 'pressable':
      return (
        <Pressable onPress={() => run(node.action, scope)}>
          {renderChildren(node.children, scope, run)}
        </Pressable>
      );

    case 'row': {
      const label = interpolate(node.label, scope);
      const detail = node.detail ? interpolate(node.detail, scope) : '';
      const badge = node.badge ? interpolate(node.badge, scope) : '';
      const tappable = !!node.action && node.action.kind !== 'none';
      return (
        <Pressable
          onPress={tappable ? () => run(node.action, scope) : undefined}
          style={({ pressed }) => [
            styles.row,
            {
              // The first row in a card must not draw a separator above itself.
              borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: t.colors.border,
              backgroundColor: pressed && tappable ? t.colors.surfaceStrong : 'transparent',
            },
          ]}>
          {node.icon ? (
            <Ionicons name={node.icon as IoniconName} size={20} color={t.colors.textMuted} />
          ) : null}
          <AppText variant="body" style={{ flex: 1 }}>
            {label}
          </AppText>
          {detail ? (
            <AppText variant="muted" tone="muted" numberOfLines={1}>
              {detail}
            </AppText>
          ) : null}
          {badge ? (
            <View style={[styles.badge, { backgroundColor: t.colors.surfaceStrong }]}>
              <AppText variant="caption" tone="accent">
                {badge}
              </AppText>
            </View>
          ) : null}
          {tappable ? (
            <Ionicons name="chevron-forward" size={16} color={t.colors.textFaint} />
          ) : null}
        </Pressable>
      );
    }

    // ── Logic ────────────────────────────────────────────────────
    case 'if':
      // `node.when` was already applied above as the visibility guard; `cond`
      // is the separate branch selector.
      return (
        <>
          {evaluate(node.cond, scope)
            ? renderChildren(node.then, scope, run)
            : renderChildren(node.else, scope, run)}
        </>
      );

    case 'repeat': {
      const items = resolveArray(node.each, scope);
      const alias = node.as ?? 'item';
      // Capped even though the server also caps it: the bound array's length is
      // runtime data the server never saw, so a client-side ceiling is the only
      // thing between a 4000-row payload and a frozen list.
      const limit = Math.min(items.length, node.max ?? 20, 60);

      if (!limit) return <>{renderChildren(node.empty, scope, run)}</>;

      return (
        <>
          {items.slice(0, limit).map((item, i) => {
            const itemScope: Scope = { ...scope, [alias]: item, [`${alias}Index`]: i };
            return (
              <View key={`${node.id}-${i}`}>
                {node.children.map((child, ci) => (
                  <SduiNode
                    key={child.id ?? ci}
                    node={child}
                    scope={itemScope}
                    run={run}
                    index={i === 0 && ci === 0 ? 0 : 1}
                  />
                ))}
              </View>
            );
          })}
        </>
      );
    }

    // ── Escape hatch ─────────────────────────────────────────────
    case 'native': {
      const Block = NATIVE_BLOCKS[node.component];
      // Not a failure: a newer server may reference a block this build predates.
      if (!Block) return null;
      return <Block scope={scope} run={run} props={node.props} />;
    }

    // `tab`, `step` and `field` are consumed by their own screen hosts, which
    // read them off the tree directly rather than rendering them inline.
    default:
      return null;
  }
}

function toneColor(t: ReturnType<typeof useTheme>, tone: Tone): string {
  switch (tone) {
    case 'muted':
      return t.colors.textMuted;
    case 'faint':
      return t.colors.textFaint;
    case 'accent':
      return t.colors.accent;
    case 'onBrand':
      return t.colors.onBrand;
    case 'danger':
      return t.colors.danger;
    case 'success':
      return t.colors.success;
    case 'warning':
      return t.colors.warning;
    default:
      return t.colors.text;
  }
}

/**
 * Isolates one subtree's render failures.
 *
 * Without this a single bad node takes the whole screen to a red box, and
 * because the layout is remote the user cannot get out of it by navigating —
 * the same tree renders again on every visit. Losing one card is recoverable;
 * losing the screen is a support ticket.
 */
export class SduiBoundary extends Component<
  { children: ReactNode; onError?: (e: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
