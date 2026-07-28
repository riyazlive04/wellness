import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type Measurement } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

const FIELDS = [
  { key: 'chest_inches', label: 'Chest' },
  { key: 'waist_inches', label: 'Waist' },
  { key: 'hip_inches', label: 'Hip' },
  { key: 'arm_inches', label: 'Arm' },
  { key: 'thigh_inches', label: 'Thigh' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

export default function Measurements() {
  const t = useTheme();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});

  const q = useQuery({ queryKey: ['me', 'measurements'], queryFn: () => clientsApi.myMeasurements(30), retry: 1 });
  const createMut = useMutation({
    mutationFn: () => {
      const body: Record<string, number> = {};
      for (const f of FIELDS) {
        const n = parseFloat(vals[f.key] ?? '');
        if (!isNaN(n) && n > 0) body[f.key] = n;
      }
      return clientsApi.logMeasurement(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'measurements'] });
      setAdding(false);
      setVals({});
    },
  });

  const rows = q.data ?? [];
  const latest = rows[0];

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            <GradientButton label="＋ Log measurements" onPress={() => setAdding(true)} />

            {latest ? (
              <Card style={{ gap: spacing.md }}>
                <Eyebrow>Latest · {new Date(latest.recorded_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Eyebrow>
                <View style={styles.grid}>
                  {FIELDS.map((f) => {
                    const v = latest[f.key as FieldKey];
                    return (
                      <View key={f.key} style={{ width: '30%', gap: 2 }}>
                        <AppText variant="heading">{v != null ? `${v}"` : '–'}</AppText>
                        <AppText variant="caption" tone="muted">{f.label}</AppText>
                      </View>
                    );
                  })}
                </View>
              </Card>
            ) : (
              <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
                <Ionicons name="resize-outline" size={26} color={t.colors.textFaint} />
                <AppText variant="muted" tone="muted">No measurements logged yet.</AppText>
              </Card>
            )}

            {rows.length > 1 ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>History</Eyebrow>
                {rows.slice(1).map((m) => <HistoryRow key={m.id} m={m} />)}
              </View>
            ) : null}
          </>
        )}
      </ScreenScroll>

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={() => setAdding(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: t.colors.canvas, borderColor: t.colors.border }]} onPress={(e) => e.stopPropagation()}>
              <AppText variant="heading">Log measurements (inches)</AppText>
              {FIELDS.map((f) => (
                <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <AppText variant="body" tone="muted" style={{ width: 70 }}>{f.label}</AppText>
                  <TextInput
                    value={vals[f.key] ?? ''}
                    onChangeText={(v) => setVals((s) => ({ ...s, [f.key]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="–"
                    placeholderTextColor={t.colors.textFaint}
                    style={[styles.input, { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
                  />
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                <GhostButton label="Cancel" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                <GradientButton label="Save" onPress={() => createMut.mutate()} loading={createMut.isPending} style={{ flex: 1 }} />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function HistoryRow({ m }: { m: Measurement }) {
  const parts = FIELDS.filter((f) => m[f.key as FieldKey] != null).map((f) => `${f.label} ${m[f.key as FieldKey]}"`);
  return (
    <Card style={{ gap: 2 }}>
      <AppText variant="caption" tone="faint">{new Date(m.recorded_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</AppText>
      <AppText variant="muted" tone="muted">{parts.join(' · ') || 'No values'}</AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sheet: { width: '100%', maxWidth: 400, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: 16 },
});
