import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { barcodeApi } from '@/lib/barcode-api';
import { mealTypeForNow, MEAL_TYPE_LABEL, type MealType } from '@/lib/plate-vision-api';
import { radius, spacing } from '@/lib/theme';

const QUICK_MEALS: MealType[] = ['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner'];

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
            <View style={[styles.reticle, { borderColor: t.colors.accent }]} />
            <AppText variant="muted" tone="onBrand" style={{ textAlign: 'center' }}>
              Point at the barcode
            </AppText>
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
      <ScreenScroll>
        {!code ? (
          <>
            <Card style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing['2xl'] }}>
              <View style={[styles.icon, { backgroundColor: t.colors.surfaceStrong }]}>
                <Ionicons name="barcode-outline" size={34} color={t.colors.accent} />
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
          <Card style={{ gap: spacing.md }}>
            <AppText variant="heading">Not found</AppText>
            <AppText variant="muted" tone="muted">
              We couldn&apos;t find barcode {code}. It may not be in the database yet.
            </AppText>
            <GhostButton label="Scan another" onPress={startScan} />
          </Card>
        ) : (
          <>
            <Card style={{ gap: spacing.md }}>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                {product.image_url ? (
                  <Image source={{ uri: product.image_url }} style={styles.thumb} contentFit="cover" />
                ) : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="heading">{product.name ?? 'Unnamed product'}</AppText>
                  {product.brand ? <AppText variant="muted" tone="muted">{product.brand}</AppText> : null}
                  <AppText variant="caption" tone="faint">{product.barcode}</AppText>
                </View>
              </View>
              {product.kcal_100g != null ? (
                <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                  <Macro label="kcal/100g" value={`${Math.round(product.kcal_100g)}`} />
                  <Macro label="P" value={fmt(product.protein_100g)} />
                  <Macro label="C" value={fmt(product.carb_100g)} />
                  <Macro label="F" value={fmt(product.fat_100g)} />
                </View>
              ) : null}
            </Card>

            <Card style={{ gap: spacing.md }}>
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
                  <AppText variant="heading" tone="accent" style={{ marginLeft: 'auto' }}>{kcalForServing()} kcal</AppText>
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
                      style={[styles.chip, { backgroundColor: active ? t.colors.primary : 'transparent', borderColor: active ? 'transparent' : t.colors.border }]}>
                      <AppText variant="caption" tone={active ? 'onBrand' : 'muted'}>{MEAL_TYPE_LABEL[m]}</AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <GradientButton label="Log this" onPress={() => logMut.mutate()} loading={logMut.isPending} />
              <GhostButton label="Scan another" onPress={startScan} />
            </Card>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" tone="muted">{label}</AppText>
    </View>
  );
}

function fmt(n: number | null): string {
  return n != null ? `${Math.round(n)}g` : '–';
}

const styles = StyleSheet.create({
  icon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: '#0002' },
  input: { width: 100, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16 },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  reticle: { width: '75%', aspectRatio: 1.6, borderWidth: 3, borderRadius: radius.lg, backgroundColor: 'transparent' },
  cancel: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill },
});
