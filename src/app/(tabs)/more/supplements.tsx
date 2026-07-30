import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type Supplement } from '@/lib/clients-api';
import { brand, radius, spacing, status } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Soft brand tint — a low-alpha wash of a brand/teal hue for chips & tracks. */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Time-of-day accent hue + icon for a schedule slot, drawn from the brand family. */
function slotMeta(slot: string): { color: string; icon: IoniconName } {
  const s = slot.toLowerCase();
  if (s.includes('morning') || s.includes('breakfast') || s.includes('am')) return { color: status.warning, icon: 'sunny-outline' };
  if (s.includes('noon') || s.includes('lunch') || s.includes('afternoon')) return { color: brand.teal, icon: 'partly-sunny-outline' };
  if (s.includes('evening') || s.includes('dinner')) return { color: brand.blue, icon: 'moon-outline' };
  if (s.includes('night') || s.includes('bed') || s.includes('pm')) return { color: brand.blue, icon: 'bed-outline' };
  return { color: brand.cyan, icon: 'time-outline' };
}

export default function Supplements() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['me', 'supplements'], queryFn: () => clientsApi.mySupplements(), retry: 1 });
  const list = q.data ?? [];
  const active = list.filter((s) => s.active);
  const inactive = list.filter((s) => !s.active);

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : list.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <View style={[styles.emptyChip, { backgroundColor: tint(brand.teal, t.dark ? 0.18 : 0.12) }]}>
              <Ionicons name="medkit-outline" size={22} color={t.colors.primary} />
            </View>
            <AppText variant="heading">No supplements yet</AppText>
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              Your nutritionist hasn&apos;t prescribed any supplements.
            </AppText>
          </Card>
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <Eyebrow>Wellness · Supplements</Eyebrow>
              <AppText variant="title">Your daily stack</AppText>
              <AppText variant="muted" tone="muted">
                What to take, and when — prescribed just for you.
              </AppText>
            </View>

            {active.map((s) => <SupplementCard key={s.id} s={s} />)}

            {inactive.length ? (
              <>
                <Eyebrow>Inactive</Eyebrow>
                {inactive.map((s) => <SupplementCard key={s.id} s={s} />)}
              </>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function SupplementCard({ s }: { s: Supplement }) {
  const t = useTheme();
  const accent = s.active ? brand.teal : t.colors.textFaint;

  return (
    <Card style={{ gap: spacing.md, borderRadius: radius.xl, opacity: s.active ? 1 : 0.75 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={[styles.iconChip, { backgroundColor: tint(s.active ? brand.teal : '#94A3B8', t.dark ? 0.2 : 0.12) }]}>
          <Ionicons name="medkit-outline" size={20} color={accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading">{s.name}</AppText>
          {s.dosage ? (
            <View style={[styles.dosePill, { backgroundColor: tint(brand.cyan, t.dark ? 0.2 : 0.12) }]}>
              <Ionicons name="flask-outline" size={12} color={t.colors.accent} />
              <AppText variant="caption" tone="accent">{s.dosage}</AppText>
            </View>
          ) : null}
        </View>
        <View style={[styles.statePill, { backgroundColor: tint(s.active ? status.success : '#94A3B8', t.dark ? 0.2 : 0.12) }]}>
          <Ionicons
            name={s.active ? 'checkmark-circle' : 'pause-circle-outline'}
            size={13}
            color={s.active ? t.colors.success : t.colors.textFaint}
          />
          <AppText variant="caption" tone={s.active ? 'success' : 'faint'}>
            {s.active ? 'Active' : 'Paused'}
          </AppText>
        </View>
      </View>

      {s.schedule.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {s.schedule.map((slot) => {
            const meta = slotMeta(slot);
            return (
              <View key={slot} style={[styles.slotPill, { backgroundColor: tint(meta.color, t.dark ? 0.18 : 0.11) }]}>
                <Ionicons name={meta.icon} size={13} color={meta.color} />
                <AppText variant="caption" style={{ color: meta.color, textTransform: 'capitalize' }}>{slot}</AppText>
              </View>
            );
          })}
        </View>
      ) : null}

      {s.notes ? (
        <View style={[styles.noteRow, { backgroundColor: tint(brand.teal, t.dark ? 0.1 : 0.07), borderColor: t.colors.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={t.colors.textMuted} />
          <AppText variant="caption" tone="muted" style={{ flex: 1 }}>{s.notes}</AppText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  emptyChip: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconChip: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  dosePill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginTop: 2 },
  statePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  slotPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
