/**
 * The client's own invoices and payment plans.
 *
 * Mobile had no billing surface at all, so a client on an instalment plan got
 * a WhatsApp reminder on their phone and then had nothing on the phone to
 * check it against - they had to open the web portal in a browser to see when
 * the next payment was due. The reminder and the answer belong in the same
 * place.
 *
 * Read-only throughout. The practice collects the money directly, so there is
 * nothing to pay here, and only the practice can move a due date: a client who
 * could shift their own dates would make the schedule meaningless. A client
 * who cannot meet a date should message their practitioner, which is two taps
 * away in the Chat tab.
 */
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { invoicesApi, type InvoiceInstalment, type PracticeInvoice } from '@/lib/invoices-api';
import { radius, spacing } from '@/lib/theme';

/** Rupees with Indian grouping; paise only when they are not zero. */
function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
}

export default function Invoices() {
  const t = useTheme();

  const q = useQuery({
    queryKey: ['me', 'invoices'],
    queryFn: () => invoicesApi.mine(),
    retry: 1,
  });

  const rows = q.data ?? [];
  // What is still owed, not what was billed: an invoice part-paid with a
  // deposit would otherwise tell the client they owe money they have already
  // handed over.
  const due = rows
    .filter((i) => i.status === 'sent')
    .reduce((s, i) => s + (i.balance_paise ?? i.total_paise), 0);

  if (q.isLoading) {
    return (
      <Screen edges={[]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={q.isRefetching}
            onRefresh={() => q.refetch()}
            tintColor={t.colors.accent}
          />
        }>
        {due > 0 ? (
          <Card style={{ gap: spacing.xs }}>
            <Eyebrow>Outstanding</Eyebrow>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <AppText variant="display" style={{ fontVariant: ['tabular-nums'], lineHeight: 40 }}>
                {inr(due)}
              </AppText>
            </View>
            <AppText variant="caption" tone="faint">
              Ask your nutritionist how they would like to be paid.
            </AppText>
          </Card>
        ) : null}

        <View style={{ gap: 4, marginTop: due > 0 ? spacing.sm : 0 }}>
          <Eyebrow>Billing</Eyebrow>
          <AppText variant="title">Your invoices</AppText>
        </View>

        {q.isError ? (
          <Card>
            <AppText variant="muted" tone="muted">
              Could not load your invoices just now. Pull down to try again.
            </AppText>
          </Card>
        ) : rows.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="document-text-outline" size={22} color={t.colors.textFaint} />
            <AppText variant="muted" tone="faint">
              No invoices yet.
            </AppText>
          </Card>
        ) : (
          rows.map((inv) => <InvoiceCard key={inv.id} invoice={inv} />)
        )}
      </ScreenScroll>
    </Screen>
  );
}

function InvoiceCard({ invoice }: { invoice: PracticeInvoice }) {
  const t = useTheme();

  // 'sent' reads as "Due" to the client - what matters is that they owe it.
  const pill = {
    sent: { label: 'Due', color: t.colors.warning },
    paid: { label: 'Paid', color: t.colors.success },
    void: { label: 'Cancelled', color: t.colors.textFaint },
    draft: { label: '', color: t.colors.textFaint }, // never reaches a client
  }[invoice.status];

  const partPaid = invoice.paid_paise > 0 && invoice.balance_paise > 0;

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
              {invoice.display_number}
            </AppText>
            {pill.label ? (
              <View
                style={[
                  styles.pill,
                  { backgroundColor: pill.color + (t.dark ? '2E' : '1A'), borderColor: pill.color + '55' },
                ]}>
                <AppText variant="caption" style={{ color: pill.color }}>
                  {pill.label}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="caption" tone="faint">
            {invoice.items[0]?.description ?? 'Invoice'}
            {invoice.items.length > 1 ? ` and ${invoice.items.length - 1} more` : ''}
          </AppText>
          <AppText variant="caption" tone="faint">
            {invoice.status === 'paid'
              ? `paid ${when(invoice.paid_at)}`
              : invoice.due_at
                ? `due ${when(invoice.due_at)}`
                : when(invoice.issued_at)}
          </AppText>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
            {inr(invoice.total_paise)}
          </AppText>
          {/* Part-paid: show what has landed and what is left, so the running
              balance here matches the invoice the practice is looking at. */}
          {partPaid ? (
            <AppText variant="caption" style={{ color: t.colors.warning }}>
              {inr(invoice.paid_paise)} paid · {inr(invoice.balance_paise)} left
            </AppText>
          ) : null}
        </View>
      </View>

      {/* A cancelled bill has no schedule worth keeping. */}
      {invoice.status !== 'void' ? <SchedulePanel invoiceId={invoice.id} /> : null}
    </Card>
  );
}

/**
 * The payment plan for one invoice, when the practice set one.
 *
 * Renders nothing at all when there is no schedule, which is most invoices: a
 * single-payment bill must not grow an empty "payment plan" heading. It is
 * also silent when the fetch fails, because the invoice above is still correct
 * and one failed sub-request should not turn the list into an error page.
 */
function SchedulePanel({ invoiceId }: { invoiceId: string }) {
  const t = useTheme();

  const q = useQuery({
    queryKey: ['me', 'invoice', invoiceId, 'instalments'],
    queryFn: () => invoicesApi.instalments(invoiceId),
    // The schedule changes only when the practice edits it, which is rare.
    staleTime: 60_000,
    retry: 1,
  });

  const parts = q.data ?? [];
  if (parts.length === 0) return null;

  const paidCount = parts.filter((p) => p.balance_paise === 0).length;
  // The next thing they actually have to pay - the earliest unpaid part.
  const next = parts.find((p) => p.balance_paise > 0) ?? null;

  return (
    <View
      style={{
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.colors.border,
        backgroundColor: t.colors.surfaceStrong,
        padding: spacing.md,
        gap: spacing.sm,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="calendar-outline" size={13} color={t.colors.textFaint} />
        <AppText variant="caption" style={{ color: t.colors.text }}>
          Payment plan
        </AppText>
        <AppText variant="caption" tone="faint">
          {paidCount} of {parts.length} paid
        </AppText>
      </View>

      {next ? (
        <View
          style={[
            styles.pill,
            {
              alignSelf: 'flex-start',
              backgroundColor: (next.overdue ? t.colors.danger : t.colors.accent) + (t.dark ? '2E' : '1A'),
              borderColor: (next.overdue ? t.colors.danger : t.colors.accent) + '55',
            },
          ]}>
          <AppText variant="caption" style={{ color: next.overdue ? t.colors.danger : t.colors.accent }}>
            {next.overdue ? 'Overdue: ' : 'Next: '}
            {inr(next.balance_paise)} on {when(next.due_at)}
          </AppText>
        </View>
      ) : null}

      <View style={{ gap: 4 }}>
        {parts.map((p) => (
          <InstalmentRow key={p.id} part={p} total={parts.length} />
        ))}
      </View>
    </View>
  );
}

function InstalmentRow({ part, total }: { part: InvoiceInstalment; total: number }) {
  const t = useTheme();
  const settled = part.balance_paise === 0;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
      <AppText variant="caption" tone="faint" style={{ width: 30, fontVariant: ['tabular-nums'] }}>
        {part.seq}/{total}
      </AppText>
      <AppText
        variant="caption"
        tone={settled ? 'faint' : 'text'}
        style={{
          fontVariant: ['tabular-nums'],
          textDecorationLine: settled ? 'line-through' : 'none',
        }}>
        {inr(part.amount_paise)}
      </AppText>
      <AppText variant="caption" style={{ color: part.overdue ? t.colors.danger : t.colors.textMuted }}>
        {settled ? 'paid' : `due ${when(part.due_at)}`}
      </AppText>
      {/* Without this a part-paid instalment reads as untouched, and a client
          who already sent half would think it was never received. */}
      {!settled && part.paid_paise > 0 ? (
        <AppText variant="caption" style={{ color: t.colors.warning }}>
          {inr(part.paid_paise)} received, {inr(part.balance_paise)} left
        </AppText>
      ) : null}
      {/* Say so when a date moved, so the client trusts the dates on screen
          rather than the ones they remember. */}
      {part.extended_count > 0 && !settled ? (
        <AppText variant="caption" tone="faint">
          (moved from {when(part.original_due_at)})
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
