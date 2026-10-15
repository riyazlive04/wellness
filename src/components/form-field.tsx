import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { radius, spacing } from '@/lib/theme';

export type QType =
  | 'text' | 'textarea' | 'single' | 'choice' | 'multi' | 'scale' | 'number'
  | 'yesno' | 'section' | 'table' | string;

export interface Question {
  id: string;
  question: string;
  type?: QType;
  options?: string[];
  max?: number;
  required?: boolean;
  rows?: string[];
  columns?: string[];
}

/** A `table` answer: { [rowLabel]: { [columnHeader]: value } }. */
export type TableAnswer = Record<string, Record<string, string>>;

export function isTableBlank(v: unknown): boolean {
  if (!v || typeof v !== 'object') return true;
  return !Object.values(v as TableAnswer).some(
    (row) =>
      row && typeof row === 'object' && Object.values(row).some((cell) => String(cell ?? '').trim() !== ''),
  );
}

/**
 * One form field. Shared by the assessment screen and the daily log so both
 * render a nutritionist-built form the same way.
 */
export function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const t = useTheme();
  const type = q.type ?? 'text';

  // The backend calls a single-choice question 'choice'; older cards use
  // 'single'. Both mean the same thing.
  if ((type === 'single' || type === 'choice') && q.options?.length) {
    return (
      <View style={styles.chips}>
        {q.options.map((opt) => {
          const on = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[
                styles.chip,
                {
                  borderColor: t.colors.border,
                  backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                },
              ]}>
              <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                {opt}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (type === 'multi' && q.options?.length) {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <View style={styles.chips}>
        {q.options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <Pressable
              key={opt}
              onPress={() =>
                onChange(on ? selected.filter((x) => x !== opt) : [...selected, opt])
              }
              style={[
                styles.chip,
                {
                  borderColor: t.colors.border,
                  backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                },
              ]}>
              <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                {opt}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (type === 'yesno') {
    return (
      <View style={styles.chips}>
        {['Yes', 'No'].map((opt) => {
          const on = value === opt || (typeof value === 'boolean' && value === (opt === 'Yes'));
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[
                styles.chip,
                {
                  borderColor: t.colors.border,
                  backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                },
              ]}>
              <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                {opt}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (type === 'scale') {
    const max = q.max ?? 10;
    // API may store scale as string ("5") — coerce so reopened answers highlight.
    const n = value == null || value === '' ? NaN : Number(value);
    return (
      <View style={styles.chips}>
        {Array.from({ length: max }, (_, i) => i + 1).map((num) => {
          const on = Number.isFinite(n) && n === num;
          return (
            <Pressable
              key={num}
              onPress={() => onChange(num)}
              style={[
                styles.scale,
                {
                  borderColor: t.colors.border,
                  backgroundColor: on ? t.colors.accent : t.colors.surfaceStrong,
                },
              ]}>
              <AppText variant="caption" style={{ color: on ? t.colors.onBrand : t.colors.text }}>
                {num}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (type === 'table' && q.rows?.length) {
    return <TableField q={q} value={value} onChange={onChange} />;
  }

  return (
    <TextInput
      value={value == null ? '' : String(value)}
      onChangeText={onChange}
      multiline={type === 'textarea'}
      keyboardType={type === 'number' ? 'decimal-pad' : 'default'}
      placeholder="Your answer"
      placeholderTextColor={t.colors.textFaint}
      style={[
        styles.input,
        {
          borderColor: t.colors.border,
          color: t.colors.text,
          backgroundColor: t.colors.surface,
          minHeight: type === 'textarea' ? 96 : undefined,
          textAlignVertical: type === 'textarea' ? 'top' : 'center',
        },
      ]}
    />
  );
}

function TableField({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const t = useTheme();
  const rows = q.rows ?? [];
  const cols = q.columns?.length ? q.columns : ['Value'];
  const data = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as TableAnswer;

  const cell = (row: string, col: string) => data[row]?.[col] ?? '';
  const setCell = (row: string, col: string, v: string) =>
    onChange({ ...data, [row]: { ...(data[row] ?? {}), [col]: v } });

  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((r) => (
        <View
          key={r}
          style={[
            styles.tableRow,
            { borderColor: t.colors.border, backgroundColor: t.colors.surface },
          ]}>
          <AppText variant="caption" style={{ fontWeight: '600' }}>
            {r}
          </AppText>
          {cols.map((c) => (
            <View key={c} style={{ gap: 4 }}>
              {cols.length > 1 || c !== 'Value' ? (
                <AppText variant="caption" tone="muted">
                  {c}
                </AppText>
              ) : null}
              <TextInput
                value={cell(r, c)}
                onChangeText={(v) => setCell(r, c, v)}
                placeholder="—"
                placeholderTextColor={t.colors.textFaint}
                style={[
                  styles.input,
                  {
                    borderColor: t.colors.border,
                    color: t.colors.text,
                    backgroundColor: t.colors.surfaceStrong,
                  },
                ]}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  scale: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  tableRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
});
