import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  MEAL_TYPE_LABEL,
  mealTypeForNow,
  plateVisionApi,
  type DetectedItem,
  type MealType,
  type PickedImage,
  type VisionAnalysisResult,
} from '@/lib/plate-vision-api';
import { radius, spacing, status } from '@/lib/theme';

const QUICK_MEAL_TYPES: MealType[] = ['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner'];

// Soft pastel fill alpha — lighter in light mode, a touch stronger in dark.
const fill = (color: string, dark: boolean) => color + (dark ? '2E' : '1A');

export default function PlateVision() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();

  const [image, setImage] = useState<PickedImage | null>(null);
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow());
  const [portions, setPortions] = useState<Record<string, number>>({});
  const [logged, setLogged] = useState(false);

  const analyzeMut = useMutation<VisionAnalysisResult, Error, PickedImage>({
    mutationFn: (img) => plateVisionApi.analyze(img),
  });
  const result = analyzeMut.data;

  const logMut = useMutation({
    mutationFn: (r: VisionAnalysisResult) =>
      plateVisionApi.log({
        meal_type: mealType,
        source: 'plate_vision',
        items: r.items.map((it) => ({
          detected_name: it.detected_name,
          food_id: it.resolved && it.food ? it.food.id : undefined,
          food_query: it.resolved ? undefined : it.detected_name,
          quantity_g: portions[it.id] ?? it.portion_g,
          cooking_method: it.cooking_method,
          ai_confidence: it.ai_confidence,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setLogged(true);
    },
  });

  const pick = async (source: 'camera' | 'library') => {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, mediaTypes: 'images' })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, mediaTypes: 'images' });
    if (res.canceled || !res.assets?.[0]) return;

    const a = res.assets[0];
    setImage({ uri: a.uri, name: a.fileName ?? 'plate.jpg', type: a.mimeType ?? 'image/jpeg' });
    setPortions({});
    analyzeMut.reset();
    logMut.reset();
    setLogged(false);
  };

  const adjust = (id: string, base: number, delta: number) =>
    setPortions((p) => ({ ...p, [id]: Math.max(0, (p[id] ?? base) + delta) }));

  const total = result?.items.reduce((sum, it) => {
    const q = portions[it.id] ?? it.portion_g;
    const perG = it.nutrients ? it.nutrients.energy_kcal / (it.portion_g || 1) : 0;
    return sum + perG * q;
  }, 0);

  const close = () => router.back();

  // ── Success state ──────────────────────────────────────────────────
  if (logged) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ModalHeader title="Logged" onClose={close} />
        <View style={styles.center}>
          <View style={[styles.successChip, { backgroundColor: fill(t.colors.success, t.dark) }]}>
            <View style={[styles.successRing, { borderColor: t.colors.success }]}>
              <Ionicons name="checkmark" size={40} color={t.colors.success} />
            </View>
          </View>
          <AppText variant="title">Meal logged</AppText>
          <AppText variant="muted" tone="muted" style={{ textAlign: 'center', maxWidth: 260 }}>
            Added to your history. Your nutritionist can review it.
          </AppText>
          <GradientButton label="Done" onPress={close} style={{ alignSelf: 'stretch', marginTop: spacing.md }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ModalHeader title="Plate Vision" onClose={close} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] }}>
        {!image ? (
          <>
            <View style={{ gap: 4 }}>
              <Eyebrow>AI · Plate Vision</Eyebrow>
              <AppText variant="title">Snap your plate.</AppText>
              <AppText variant="muted" tone="muted">
                We identify the food and look up the exact nutrition. Top-down photos work best.
              </AppText>
            </View>
            <Card style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing['2xl'] }}>
              <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bigMark}>
                <Ionicons name="camera" size={34} color={t.colors.onBrand} />
              </LinearGradient>
              <AppText variant="heading">Show me your meal</AppText>
              <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
                <GradientButton label="Use camera" onPress={() => pick('camera')} />
                <GhostButton label="Choose from library" onPress={() => pick('library')} />
              </View>
            </Card>

            {/* Friendly tips — soft tinted rows for the wellness feel. */}
            <View style={{ gap: spacing.sm }}>
              <Tip icon="sunny-outline" tint={status.warning} text="Bright, even light reads best" />
              <Tip icon="scan-outline" tint={t.colors.primary} text="Frame the whole plate, top-down" />
              <Tip icon="restaurant-outline" tint={status.success} text="One dish at a time is most accurate" />
            </View>
          </>
        ) : (
          <>
            {/* Preview with camera framing corners */}
            <View style={styles.preview}>
              <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              {[styles.cornerTL, styles.cornerTR, styles.cornerBL, styles.cornerBR].map((c, i) => (
                <View key={i} pointerEvents="none" style={[styles.corner, c]} />
              ))}
              <Pressable onPress={() => setImage(null)} style={[styles.retake, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                <Ionicons name="refresh" size={14} color="#fff" />
                <AppText variant="caption" tone="onBrand">
                  Retake
                </AppText>
              </Pressable>
              {analyzeMut.isPending ? (
                <View style={styles.analyzing}>
                  <ActivityIndicator color={t.colors.onBrand} />
                  <AppText variant="muted" tone="onBrand">
                    Analyzing…
                  </AppText>
                </View>
              ) : null}
            </View>

            {/* Analyze CTA (before result) */}
            {!result && !analyzeMut.isPending ? (
              <GradientButton label="Analyze plate" onPress={() => analyzeMut.mutate(image)} />
            ) : null}

            {analyzeMut.isError ? (
              <Card style={{ gap: spacing.xs }}>
                <AppText variant="heading" tone="danger">
                  Couldn&apos;t analyze that
                </AppText>
                <AppText variant="muted" tone="muted">
                  {analyzeMut.error?.message ?? 'Try another photo or check your connection.'}
                </AppText>
                <GhostButton label="Try again" onPress={() => analyzeMut.mutate(image)} style={{ marginTop: spacing.xs }} />
              </Card>
            ) : null}

            {/* Result: meal type + items */}
            {result ? (
              <>
                <View style={{ gap: spacing.sm }}>
                  <Eyebrow>Meal</Eyebrow>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                    {QUICK_MEAL_TYPES.map((mt) => {
                      const active = mealType === mt;
                      return (
                        <Pressable
                          key={mt}
                          onPress={() => setMealType(mt)}
                          style={[
                            styles.chip,
                            {
                              borderColor: active ? t.colors.primary : t.colors.border,
                              backgroundColor: active ? fill(t.colors.primary, t.dark) : t.colors.surfaceStrong,
                            },
                          ]}>
                          <AppText variant="muted" tone={active ? 'accent' : 'muted'}>
                            {MEAL_TYPE_LABEL[mt]}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* AI nutrition summary — rounded card with kcal + macro chips */}
                {result.items.length > 0 ? (
                  <Card style={{ gap: spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ gap: 2 }}>
                        <Eyebrow>Estimated nutrition</Eyebrow>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs }}>
                          <AppText variant="display" tone="accent" style={{ fontVariant: ['tabular-nums'] }}>
                            {Math.round(total ?? 0)}
                          </AppText>
                          <AppText variant="muted" tone="muted" style={{ marginBottom: 8 }}>
                            kcal
                          </AppText>
                        </View>
                      </View>
                      <Verdict unresolved={result.unresolved_count} />
                    </View>
                    <View style={styles.macroRow}>
                      <Macro tint={status.info} label="Protein" value={result.totals.protein_g} />
                      <Macro tint={status.warning} label="Carbs" value={result.totals.carbohydrate_g} />
                      <Macro tint="#7C6BD6" label="Fat" value={result.totals.fat_g} />
                    </View>
                  </Card>
                ) : null}

                <View style={{ gap: spacing.sm }}>
                  <Eyebrow>Detected · {result.items.length}</Eyebrow>

                  {result.items.length === 0 ? (
                    <Card style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm }}>
                      <View style={[styles.emptyChip, { backgroundColor: t.colors.surfaceStrong }]}>
                        <Ionicons name="help-circle-outline" size={24} color={t.colors.textFaint} />
                      </View>
                      <AppText variant="muted" tone="muted">
                        No food detected. Try a clearer, top-down photo.
                      </AppText>
                    </Card>
                  ) : (
                    result.items.map((it) => (
                      <ItemRow
                        key={it.id}
                        item={it}
                        portion={portions[it.id] ?? it.portion_g}
                        onAdjust={(delta) => adjust(it.id, it.portion_g, delta)}
                      />
                    ))
                  )}
                </View>

                {result.items.length > 0 ? (
                  <GradientButton
                    label={`Log ${MEAL_TYPE_LABEL[mealType].toLowerCase()}`}
                    onPress={() => logMut.mutate(result)}
                    loading={logMut.isPending}
                  />
                ) : null}
                {logMut.isError ? (
                  <AppText variant="muted" tone="danger" style={{ textAlign: 'center' }}>
                    {logMut.error?.message ?? 'Could not log the meal.'}
                  </AppText>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Soft tinted status chip summarising how well the AI resolved the plate. */
function Verdict({ unresolved }: { unresolved: number }) {
  const t = useTheme();
  const clean = unresolved === 0;
  const tint = clean ? t.colors.success : t.colors.warning;
  return (
    <View style={[styles.verdict, { backgroundColor: fill(tint, t.dark) }]}>
      <Ionicons name={clean ? 'checkmark-circle' : 'alert-circle'} size={14} color={tint} />
      <AppText variant="caption" tone={clean ? 'success' : 'warning'}>
        {clean ? 'All matched' : `${unresolved} to review`}
      </AppText>
    </View>
  );
}

/** A single macro read-out inside a soft tinted tile. */
function Macro({ tint, label, value }: { tint: string; label: string; value: number }) {
  const t = useTheme();
  return (
    <View style={[styles.macro, { backgroundColor: fill(tint, t.dark) }]}>
      <AppText variant="heading" style={{ color: tint, fontVariant: ['tabular-nums'] }}>
        {Math.round(value)}
        <AppText variant="caption" style={{ color: tint }}> g</AppText>
      </AppText>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

function Tip({ icon, tint, text }: { icon: keyof typeof Ionicons.glyphMap; tint: string; text: string }) {
  const t = useTheme();
  return (
    <View style={styles.tipRow}>
      <View style={[styles.tipChip, { backgroundColor: fill(tint, t.dark) }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <AppText variant="muted" tone="muted" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

function ItemRow({
  item,
  portion,
  onAdjust,
}: {
  item: DetectedItem;
  portion: number;
  onAdjust: (delta: number) => void;
}) {
  const t = useTheme();
  const perG = item.nutrients ? item.nutrients.energy_kcal / (item.portion_g || 1) : 0;
  const kcal = Math.round(perG * portion);
  const tint = item.resolved ? t.colors.success : t.colors.warning;
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="body">{item.food?.canonical_name ?? item.detected_name}</AppText>
          <View style={[styles.itemVerdict, { backgroundColor: fill(tint, t.dark) }]}>
            <Ionicons
              name={item.resolved ? 'checkmark-circle' : 'alert-circle'}
              size={12}
              color={tint}
            />
            <AppText variant="caption" tone={item.resolved ? 'success' : 'warning'}>
              {item.resolved ? `${Math.round(item.ai_confidence * 100)}% match` : 'Needs review'}
              {item.cooking_method ? ` · ${item.cooking_method}` : ''}
            </AppText>
          </View>
        </View>
        <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
          {kcal}
          <AppText variant="caption" tone="faint">
            {' '}kcal
          </AppText>
        </AppText>
      </View>
      <View style={styles.stepper}>
        <Stepper icon="remove" onPress={() => onAdjust(-25)} color={t.colors.text} bg={t.colors.surfaceStrong} />
        <AppText variant="body" style={{ minWidth: 70, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {Math.round(portion)} g
        </AppText>
        <Stepper icon="add" onPress={() => onAdjust(25)} color={t.colors.text} bg={t.colors.surfaceStrong} />
      </View>
    </Card>
  );
}

function Stepper({ icon, onPress, color, bg }: { icon: 'add' | 'remove'; onPress: () => void; color: string; bg: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.step, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const t = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: t.colors.border }]}>
      <AppText variant="heading">{title}</AppText>
      <Pressable onPress={onClose} hitSlop={10} style={[styles.close, { backgroundColor: t.colors.surfaceStrong }]}>
        <Ionicons name="close" size={18} color={t.colors.textMuted} />
      </Pressable>
    </View>
  );
}

const CORNER = 26;
const CORNER_W = 3;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  successChip: {
    width: 128,
    height: 128,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  successRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigMark: {
    width: 80,
    height: 80,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    aspectRatio: 4 / 5,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  cornerTL: { top: spacing.md, left: spacing.md, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W, borderTopLeftRadius: 10 },
  cornerTR: { top: spacing.md, right: spacing.md, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderTopRightRadius: 10 },
  cornerBL: { bottom: spacing.md, left: spacing.md, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W, borderBottomLeftRadius: 10 },
  cornerBR: { bottom: spacing.md, right: spacing.md, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderBottomRightRadius: 10 },
  retake: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  analyzing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macro: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  itemVerdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  emptyChip: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tipChip: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  step: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
