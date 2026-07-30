import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, KeyboardAwareScroll, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { barcodeApi } from '@/lib/barcode-api';
import { mealTypeForNow, MEAL_TYPE_LABEL, type MealType } from '@/lib/plate-vision-api';
import { brand, radius, spacing, status, tintFill } from '@/lib/theme';

const QUICK_MEALS: MealType[] = ['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner'];

const fill = (color: string, dark: boolean) => tintFill(color, dark);
const chipBg = (color: string) => color + '33';

export default function Barcode() {
  const t = useTheme();
  const qc = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [grams, setGrams] = useState('100');
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow());

  const productQ = useQuery({
    queryKey: ['barcode', code],
    queryFn: () => barcodeApi.lookup(code!),
    enabled: !!code,
    retry: 0,
  });
  const product = productQ.data;

  const logMut = useMutation({
    mutationFn: () =>
      barcodeApi.log({
        barcode: code!,
        mealType,
        servingGrams: parseFloat(grams) || 100,
        mealName: product?.name ?? undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['me'] });
      Alert.alert('Logged ✅', `${r.meal_name ?? 'Item'}${r.kcal ? ` · ${Math.round(r.kcal)} kcal` : ''}`);
      setCode(null);
    },
    onError: (e: Error) => Alert.alert('Could not log', e.message),
  });

  // Manual entry when a scan isn't in the database (common for regional SKUs).
  const [manual, setManual] = useState(false);
  const [mf, setMf] = useState({ name: '', kcal: '', protein: '', carb: '', fat: '', serving: '' });
  const saveManualMut = useMutation({
    mutationFn: () =>
      barcodeApi.saveManual({
        barcode: code!,
        name: mf.name.trim() || undefined,
        serving_size: mf.serving.trim() || undefined,
        kcal_100g: parseFloat(mf.kcal),
        protein_100g: mf.protein ? parseFloat(mf.protein) : undefined,
        carb_100g: mf.carb ? parseFloat(mf.carb) : undefined,
        fat_100g: mf.fat ? parseFloat(mf.fat) : undefined,
      }),
    onSuccess: (p) => {
      // Prime the lookup cache so the normal product → serving → log flow appears.
      qc.setQueryData(['barcode', code], p);
      setManual(false);
      setMf({ name: '', kcal: '', protein: '', carb: '', fat: '', serving: '' });
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  const startScan = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Camera needed', 'Allow camera access to scan barcodes.');
        return;
      }
    }
    setCode(null);
    setScanning(true);
  };

  const kcalForServing = () => {
    const g = parseFloat(grams) || 0;
    return product?.kcal_100g != null ? Math.round((product.kcal_100g * g) / 100) : null;
  };

  // ── Live scanner ────────────────────────────────────────────────
  if (scanning) {
    return (
      <Screen edges={[]}>
        <View style={{ flex: 1 }}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
            onBarcodeScanned={({ data }) => {
              if (!data) return;
              setScanning(false);
              setCode(data);
            }}
          />
          <View style={styles.overlay}>
            <View style={styles.reticle}>
              {/* Rounded corner brackets in the brand accent frame the barcode. */}
              <View style={[styles.corner, styles.cornerTL, { borderColor: t.colors.accent }]} />
              <View style={[styles.corner, styles.cornerTR, { borderColor: t.colors.accent }]} />
              <View style={[styles.corner, styles.cornerBL, { borderColor: t.colors.accent }]} />
              <View style={[styles.corner, styles.cornerBR, { borderColor: t.colors.accent }]} />
            </View>
            <View style={styles.hint}>
              <Ionicons name="barcode-outline" size={16} color="#fff" />
              <AppText variant="muted" tone="onBrand">
                Point at the barcode
              </AppText>
            </View>
          </View>
          <Pressable onPress={() => setScanning(false)} style={[styles.cancel, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
            <Ionicons name="close" size={20} color="#fff" />
            <AppText variant="muted" tone="onBrand">Cancel</AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <KeyboardAwareScroll contentContainerStyle={{ paddingBottom: 110 }}>
        {!code ? (
          <>
            <Card
              style={{
                alignItems: 'center',
                gap: spacing.lg,
                paddingVertical: spacing['2xl'],
                backgroundColor: fill(brand.teal, t.dark),
                borderColor: brand.teal + (t.dark ? '33' : '24'),
              }}>
              <View style={[styles.icon, { backgroundColor: chipBg(brand.teal) }]}>
                <Ionicons name="barcode-outline" size={34} color={brand.teal} />
              </View>
              <AppText variant="heading">Scan a packaged food</AppText>
              <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                Point your camera at the barcode and we&apos;ll look up its nutrition.
              </AppText>
              <GradientButton label="Open scanner" onPress={startScan} style={{ alignSelf: 'stretch' }} />
            </Card>
          </>
        ) : productQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center', gap: spacing.md }}>
            <ActivityIndicator color={t.colors.accent} />
            <AppText variant="muted" tone="muted">Looking up {code}…</AppText>
          </View>
        ) : productQ.isError || !product ? (
          <>
            <Card
              style={{
                gap: spacing.md,
                alignItems: 'center',
                paddingVertical: spacing['2xl'],
                backgroundColor: fill(status.warning, t.dark),
                borderColor: status.warning + (t.dark ? '33' : '24'),
              }}>
              <View style={[styles.icon, { backgroundColor: chipBg(status.warning) }]}>
                <Ionicons name="search-outline" size={30} color={status.warning} />
              </View>
              <AppText variant="heading">Not found</AppText>
              <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                We couldn&apos;t find barcode {code}. Add it from the label and we&apos;ll remember it next time.
              </AppText>
              {!manual ? (
                <>
                  <GradientButton label="＋ Add from label" onPress={() => setManual(true)} style={{ alignSelf: 'stretch' }} />
                  <GhostButton label="Scan another" onPress={startScan} style={{ alignSelf: 'stretch' }} />
                </>
              ) : null}
            </Card>

            {manual ? (
              <Card style={{ gap: spacing.md }}>
                <Eyebrow>Nutrition per 100 g (from the pack)</Eyebrow>
                <ManualField label="Product name" value={mf.name} placeholder="e.g. Al Ain Water" onChangeText={(v) => setMf((s) => ({ ...s, name: v }))} />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <ManualField flex label="Energy (kcal) *" value={mf.kcal} numeric placeholder="per 100 g" onChangeText={(v) => setMf((s) => ({ ...s, kcal: v }))} />
                  <ManualField flex label="Protein (g)" value={mf.protein} numeric onChangeText={(v) => setMf((s) => ({ ...s, protein: v }))} />
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <ManualField flex label="Carbs (g)" value={mf.carb} numeric onChangeText={(v) => setMf((s) => ({ ...s, carb: v }))} />
                  <ManualField flex label="Fat (g)" value={mf.fat} numeric onChangeText={(v) => setMf((s) => ({ ...s, fat: v }))} />
                </View>
                <ManualField label="Serving size (optional)" value={mf.serving} placeholder="e.g. 30 g" onChangeText={(v) => setMf((s) => ({ ...s, serving: v }))} />
                <GradientButton
                  label="Save & continue"
                  onPress={() => saveManualMut.mutate()}
                  loading={saveManualMut.isPending}
                  disabled={!mf.kcal.trim() || Number.isNaN(parseFloat(mf.kcal))}
                />
                <GhostButton label="Cancel" onPress={() => setManual(false)} />
              </Card>
            ) : null}
          </>
        ) : (
          <>
            <Card style={{ gap: spacing.lg, borderRadius: radius['2xl'] }}>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                {product.image_url ? (
                  <Image source={{ uri: product.image_url }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: fill(brand.teal, t.dark) }]}>
                    <Ionicons name="fast-food-outline" size={26} color={brand.teal} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2, justifyContent: 'center' }}>
                  <AppText variant="heading">{product.name ?? 'Unnamed product'}</AppText>
                  {product.brand ? <AppText variant="muted" tone="muted">{product.brand}</AppText> : null}
                  <AppText variant="caption" tone="faint">{product.barcode}</AppText>
                </View>
              </View>
              {product.kcal_100g != null ? (
                <View style={styles.macroRow}>
                  <NutriChip label="kcal /100g" value={`${Math.round(product.kcal_100g)}`} tint={status.warning} />
                  <NutriChip label="Protein" value={fmt(product.protein_100g)} tint={brand.teal} />
                  <NutriChip label="Carbs" value={fmt(product.carb_100g)} tint={brand.blue} />
                  <NutriChip label="Fat" value={fmt(product.fat_100g)} tint="#7C6BD6" />
                </View>
              ) : null}
            </Card>

            <Card style={{ gap: spacing.md, borderRadius: radius['2xl'] }}>
              <Eyebrow>Serving</Eyebrow>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <TextInput
                  value={grams}
                  onChangeText={setGrams}
                  keyboardType="decimal-pad"
                  style={[styles.input, { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
                />
                <AppText variant="body" tone="muted">grams</AppText>
                {kcalForServing() != null ? (
                  <View style={[styles.kcalPill, { backgroundColor: fill(brand.teal, t.dark) }]}>
                    <Ionicons name="flame" size={13} color={t.colors.accent} />
                    <AppText variant="heading" tone="accent">{kcalForServing()} kcal</AppText>
                  </View>
                ) : null}
              </View>

              <Eyebrow>Meal</Eyebrow>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {QUICK_MEALS.map((m) => {
                  const active = m === mealType;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMealType(m)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? fill(brand.teal, t.dark) : 'transparent',
                          borderColor: active ? brand.teal + (t.dark ? '55' : '40') : t.colors.border,
                        },
                      ]}>
                      <AppText variant="caption" style={{ color: active ? t.colors.accent : t.colors.textMuted }}>
                        {MEAL_TYPE_LABEL[m]}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <GradientButton label="＋ Log this" onPress={() => logMut.mutate()} loading={logMut.isPending} />
              <GhostButton label="Scan another" onPress={startScan} />
            </Card>
          </>
        )}
      </KeyboardAwareScroll>
    </Screen>
  );
}

function NutriChip({ label, value, tint }: { label: string; value: string; tint: string }) {
  const t = useTheme();
  return (
    <View style={[styles.nutriChip, { backgroundColor: fill(tint, t.dark), borderColor: tint + (t.dark ? '33' : '24') }]}>
      <AppText variant="heading" style={{ color: tint }}>{value}</AppText>
      <AppText variant="caption" tone="muted">{label}</AppText>
    </View>
  );
}

function ManualField({
  label,
  value,
  onChangeText,
  placeholder,
  numeric,
  flex,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
  flex?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6, flex: flex ? 1 : undefined }}>
      <AppText variant="caption" tone="muted">{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.colors.textFaint}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        autoCapitalize={numeric ? 'none' : 'words'}
        style={[styles.mInput, { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
      />
    </View>
  );
}

function fmt(n: number | null): string {
  return n != null ? `${Math.round(n)}g` : '–';
}

const styles = StyleSheet.create({
  icon: { width: 72, height: 72, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: '#0002' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  macroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  nutriChip: {
    flexGrow: 1,
    minWidth: '22%',
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kcalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 'auto',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  input: { width: 100, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16 },
  mInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15 },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  reticle: { width: '75%', aspectRatio: 1.6 },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: '#fff' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radius.lg },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radius.lg },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radius.lg },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radius.lg },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  cancel: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill },
});
