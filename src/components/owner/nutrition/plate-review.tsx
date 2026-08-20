/**
 * Plate review — ports the web PlateReview page.
 *
 * The queue of AI-analysed client meal photos waiting for a human verdict.
 * This is the most phone-shaped job in the whole owner portal: look at the
 * photo, check the detected items and portions, approve / adjust / flag.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  Field,
  ListRow,
  Loading,
  Pill,
  SegmentedTabs,
  Sheet,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  MEAL_TYPE_LABEL,
  REVIEW_STATUS_LABEL,
  plateVisionApi,
  type PlateReviewStatus,
  type ReviewQueueItem,
} from '@/lib/owner/api/plate-vision';
import { dateTime, pct, titleCase } from '@/lib/owner/format';
import { radius, spacing } from '@/lib/theme';

const STATUS_TABS: PlateReviewStatus[] = ['pending', 'flagged', 'adjusted', 'approved'];

export function PlateReviewSection() {
  const t = useTheme();
  const [status, setStatus] = useState<PlateReviewStatus>('pending');
  const [open, setOpen] = useState<ReviewQueueItem | null>(null);

  const queueQ = useQuery({
    queryKey: ['plates', 'review', status],
    queryFn: () => plateVisionApi.reviewQueue({ status, limit: 50 }),
  });

  return (
    <>
      <SegmentedTabs
        options={STATUS_TABS.map((s) => ({ key: s, label: REVIEW_STATUS_LABEL[s] }))}
        value={status}
        onChange={setStatus}
      />

      {queueQ.isLoading ? (
        <Loading />
      ) : queueQ.isError ? (
        <QueryError error={queueQ.error} onRetry={() => void queueQ.refetch()} />
      ) : !queueQ.data?.length ? (
        <EmptyState
          icon={status === 'pending' ? 'checkmark-done-outline' : 'camera-outline'}
          title={status === 'pending' ? 'Nothing to review' : `No ${REVIEW_STATUS_LABEL[status].toLowerCase()} plates`}
          body={
            status === 'pending'
              ? 'Every meal photo your clients logged has had a verdict.'
              : undefined
          }
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {queueQ.data.map((p) => (
            <ListRow
              key={p.id}
              title={p.client_name ?? 'Client'}
              subtitle={`${MEAL_TYPE_LABEL[p.meal_type]} · ${p.item_count} items · ${dateTime(p.logged_at)}`}
              icon="camera-outline"
              tint={
                p.review_status === 'flagged'
                  ? t.colors.danger
                  : p.review_status === 'approved'
                    ? t.colors.success
                    : undefined
              }
              meta={`${Math.round(p.totals.energy_kcal)} kcal`}
              onPress={() => setOpen(p)}
            />
          ))}
        </Card>
      )}

      <ReviewSheet plate={open} onClose={() => setOpen(null)} />
    </>
  );
}

function ReviewSheet({ plate, onClose }: { plate: ReviewQueueItem | null; onClose: () => void }) {
  const qc = useQueryClient();
  const t = useTheme();
  const [note, setNote] = useState('');

  // The list payload omits items; the detail call carries them.
  const detailQ = useQuery({
    queryKey: ['plates', 'review', 'detail', plate?.id],
    queryFn: () => plateVisionApi.getForReview(plate!.id),
    enabled: !!plate,
  });

  const review = useMutation({
    mutationFn: (verdict: 'approved' | 'adjusted' | 'flagged') =>
      plateVisionApi.review(plate!.id, { status: verdict, note: note.trim() || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plates'] });
      setNote('');
      onClose();
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  const p = detailQ.data ?? plate;

  return (
    <Sheet visible={!!plate} onClose={onClose} title={p?.client_name ?? 'Plate'}>
      {detailQ.isLoading && !plate ? (
        <Loading />
      ) : p ? (
        <>
          {p.photo_url ? (
            <Image
              source={{ uri: p.photo_url }}
              style={{ width: '100%', height: 200, borderRadius: radius.lg }}
              contentFit="cover"
              transition={150}
            />
          ) : null}

          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Pill label={MEAL_TYPE_LABEL[p.meal_type]} tone="accent" />
            <Pill label={REVIEW_STATUS_LABEL[p.review_status]} />
            {p.ai_confidence !== null ? <Pill label={`AI ${pct(p.ai_confidence, 1)}`} /> : null}
            <Pill label={titleCase(p.source)} />
            {/* The most important chip on this sheet: whether these numbers are
                traceable engine output or the model's read of a photograph. */}
            <Pill
              label={p.nutrition_source === 'ai_estimate' ? 'Photo estimate' : 'Engine'}
              tone={p.nutrition_source === 'ai_estimate' ? 'warning' : 'success'}
            />
          </View>

          <AppText variant="caption" tone="faint">
            {dateTime(p.logged_at)}
          </AppText>

          <Card style={{ gap: spacing.xs }}>
            <AppText variant="label" tone="faint">
              TOTALS
            </AppText>
            <AppText variant="body">
              {`${Math.round(p.totals.energy_kcal)} kcal · P ${round(p.totals.protein_g)}g · C ${round(p.totals.carbohydrate_g)}g · F ${round(p.totals.fat_g)}g`}
            </AppText>
            {p.nutrition_source === 'ai_estimate' ? (
              <AppText variant="caption" tone="faint">
                {p.analysis?.calories_range
                  ? `Read as ${p.analysis.dish_name ?? 'this dish'} · likely ${p.analysis.calories_range.min}-${p.analysis.calories_range.max} kcal`
                  : 'Estimated from the photo — approximate, not a database lookup.'}
              </AppText>
            ) : null}
          </Card>

          <AppText variant="label" tone="muted">
            DETECTED ITEMS
          </AppText>
          {!p.items?.length ? (
            <AppText variant="muted" tone="faint">
              {detailQ.isLoading ? 'Loading items…' : 'No item breakdown recorded.'}
            </AppText>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {p.items.map((item) => (
                <ListRow
                  key={item.id}
                  title={item.food_name || item.detected_name}
                  subtitle={[
                    `${item.quantity_g} g`,
                    item.cooking_method ? titleCase(item.cooking_method) : null,
                    // 'ai_estimated' is a normal outcome here, not a
                    // problem to flag — label it plainly.
                    item.resolution_status === 'ai_estimated'
                      ? 'Estimated'
                      : item.resolution_status !== 'resolved'
                        ? titleCase(item.resolution_status)
                        : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  icon="restaurant-outline"
                  tint={item.resolution_status === 'manual_review' ? t.colors.warning : undefined}
                  meta={item.nutrition ? `${Math.round(item.nutrition.energy_kcal)} kcal` : undefined}
                />
              ))}
            </Card>
          )}

          {p.insight ? (
            <Card style={{ gap: spacing.xs }}>
              <AppText variant="label" tone="faint">
                AI INSIGHT
              </AppText>
              <AppText variant="body">{p.insight.summary}</AppText>
              {p.insight.flags.length ? (
                <AppText variant="caption" tone="warning">
                  {p.insight.flags.join(' · ')}
                </AppText>
              ) : null}
            </Card>
          ) : null}

          <Field
            label="Note for the client (optional)"
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="What you corrected, or what to do differently next time"
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />

          <View style={{ gap: spacing.sm }}>
            <ActionButton
              label="Approve"
              icon="checkmark-circle-outline"
              loading={review.isPending}
              onPress={() => review.mutate('approved')}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <ActionButton
                  label="Adjusted"
                  icon="create-outline"
                  tone="neutral"
                  onPress={() => review.mutate('adjusted')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton
                  label="Flag"
                  icon="flag-outline"
                  tone="danger"
                  onPress={() => review.mutate('flagged')}
                />
              </View>
            </View>
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
