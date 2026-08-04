/**
 * Billing — ports the web Billing page.
 *
 * Four sections: the current subscription, the plan picker (with proration
 * preview on a change), AI-credit top-ups, and GST invoices. Payment runs
 * through the same WebView Razorpay checkout the client store uses, so no
 * native payment SDK is needed.
 *
 * Owner-only server-side; the nav already hides it from staff without
 * `billing.manage`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  ListRow,
  Loading,
  OwnerPage,
  Pill,
  RouteGate,
  SegmentedTabs,
  Sheet,
  StatTile,
  TileRow,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { RazorpayCheckout, type RazorpaySuccess } from '@/components/razorpay-checkout';
import { AppText, Card } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useOwner } from '@/contexts/owner-context';
import { useTheme } from '@/hooks/use-theme';
import { billingApi, type PlanKey, type TopupKey } from '@/lib/owner/api/billing';
import { tenancyApi } from '@/lib/owner/api/tenancy';
import { dateTime, inr, shortDate, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Tab = 'plan' | 'topups' | 'invoices';

/** What checkout is currently open, and how to verify it when it succeeds. */
type Pending =
  | { kind: 'topup'; topupKey: TopupKey; orderId: string; amountPaise: number; label: string }
  | { kind: 'subscription'; subscriptionId: string; label: string };

export default function OwnerBilling() {
  return (
    <RouteGate permission="billing.manage">
      <BillingInner />
    </RouteGate>
  );
}

function BillingInner() {
  const t = useTheme();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { scope } = useOwner();
  const [tab, setTab] = useState<Tab>('plan');
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [previewFor, setPreviewFor] = useState<PlanKey | null>(null);

  const plansQ = useQuery({ queryKey: ['billing', 'plans'], queryFn: billingApi.listPlans });
  const subQ = useQuery({ queryKey: ['billing', 'subscription'], queryFn: billingApi.currentSubscription });
  const invoicesQ = useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: billingApi.listInvoices,
    enabled: tab === 'invoices',
  });
  const limitsQ = useQuery({ queryKey: ['tenancy', 'limits'], queryFn: tenancyApi.getLimits });
  const notifQ = useQuery({ queryKey: ['billing', 'notifications'], queryFn: billingApi.listNotifications });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['billing'] });

  const startTopup = useMutation({
    mutationFn: (key: TopupKey) => billingApi.createOrder(key),
    onSuccess: (res) =>
      setPending({
        kind: 'topup',
        topupKey: res.topup.key,
        orderId: res.orderId,
        amountPaise: res.amountPaise,
        label: res.topup.name,
      }),
    onError: (e: Error) => Alert.alert('Could not start payment', e.message),
  });

  const startSubscription = useMutation({
    mutationFn: ({ planKey, cycle }: { planKey: PlanKey; cycle: 'monthly' | 'annual' }) =>
      billingApi.createSubscription(planKey, cycle),
    onSuccess: (res, vars) =>
      setPending({
        kind: 'subscription',
        subscriptionId: res.subscriptionId,
        label: `${titleCase(vars.planKey)} (${vars.cycle})`,
      }),
    onError: (e: Error) => Alert.alert('Could not start subscription', e.message),
  });

  const cancel = useMutation({
    mutationFn: () => billingApi.cancel(),
    onSuccess: () => {
      refresh();
      Alert.alert('Cancelled', 'Your plan stays active until the end of the current period.');
    },
    onError: (e: Error) => Alert.alert('Could not cancel', e.message),
  });

  const onCheckoutSuccess = async (r: RazorpaySuccess) => {
    if (!pending) return;
    try {
      if (pending.kind === 'topup') {
        await billingApi.verifyOrder({
          razorpayOrderId: r.razorpay_order_id!,
          razorpayPaymentId: r.razorpay_payment_id,
          razorpaySignature: r.razorpay_signature,
          topupKey: pending.topupKey,
        });
      } else {
        await billingApi.verifySubscription({
          razorpayPaymentId: r.razorpay_payment_id,
          razorpaySubscriptionId: r.razorpay_subscription_id!,
          razorpaySignature: r.razorpay_signature,
        });
      }
      setPending(null);
      // A plan change alters entitlements — the scope must be re-read.
      void qc.invalidateQueries();
      Alert.alert('Payment confirmed', `${pending.label} is active.`);
    } catch (e) {
      setPending(null);
      Alert.alert(
        'Payment taken, verification failed',
        e instanceof Error
          ? `${e.message}\n\nDon't pay again — contact support with your payment id.`
          : 'Contact support with your payment id.',
      );
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([plansQ.refetch(), subQ.refetch(), limitsQ.refetch(), invoicesQ.refetch()]);
    setRefreshing(false);
  };

  const sub = subQ.data?.subscription ?? null;
  const plans = (plansQ.data?.plans ?? []).filter((p) => !p.legacy);
  const configured = plansQ.data?.razorpayConfigured ?? false;
  const limits = limitsQ.data;
  const unreadNotifs = notifQ.data?.unread ?? 0;

  return (
    <OwnerPage
      title="Billing"
      subtitle={sub ? `${titleCase(sub.plan_key)} · ${titleCase(sub.status)}` : 'No active subscription'}
      back
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }
      contentStyle={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {!configured ? (
          <Card style={{ gap: spacing.xs }}>
            <Pill label="Payments not live" tone="warning" />
            <AppText variant="muted" tone="muted">
              {"Razorpay keys aren't configured on this deployment, so checkout will not complete."}
            </AppText>
          </Card>
        ) : null}

        {unreadNotifs ? (
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Pill label={`${unreadNotifs} new`} tone="warning" />
              <AppText variant="heading" style={{ flex: 1 }}>
                Billing alerts
              </AppText>
            </View>
            {(notifQ.data?.notifications ?? [])
              .filter((n) => !n.read_at)
              .slice(0, 3)
              .map((n) => (
                <View key={n.id} style={{ gap: 2 }}>
                  <AppText variant="body">{n.title}</AppText>
                  <AppText variant="muted" tone="muted">
                    {n.body}
                  </AppText>
                </View>
              ))}
            <ActionButton
              label="Mark all read"
              tone="neutral"
              onPress={() =>
                void billingApi.markAllNotificationsRead().then(() => notifQ.refetch())
              }
            />
          </Card>
        ) : null}

        {subQ.isLoading ? (
          <Loading />
        ) : subQ.isError ? (
          <QueryError error={subQ.error} onRetry={() => void subQ.refetch()} />
        ) : (
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="heading" style={{ flex: 1 }}>
                {sub ? titleCase(sub.plan_key) : titleCase(scope?.plan ?? 'trial')}
              </AppText>
              <Pill
                label={sub ? titleCase(sub.status) : 'Trial'}
                tone={sub?.status === 'active' ? 'success' : 'warning'}
              />
            </View>
            {sub?.amount_paise ? (
              <AppText variant="title">{inr(sub.amount_paise, { fromPaise: true })}</AppText>
            ) : null}
            {sub?.current_period_end ? (
              <AppText variant="muted" tone="muted">
                {`Renews ${shortDate(sub.current_period_end)}`}
              </AppText>
            ) : scope?.trialEndsAt ? (
              <AppText variant="muted" tone="muted">
                {`Trial ends ${shortDate(scope.trialEndsAt)}`}
              </AppText>
            ) : null}
            {subQ.data?.setup_fee_paid_at ? (
              <AppText variant="caption" tone="faint">
                {`Setup fee paid ${shortDate(subQ.data.setup_fee_paid_at)}`}
              </AppText>
            ) : (
              <AppText variant="caption" tone="warning">
                Setup fee is due on your next subscribe.
              </AppText>
            )}
            {sub?.cancelled_at ? (
              <AppText variant="caption" tone="danger">
                {`Cancelled ${shortDate(sub.cancelled_at)} — access continues to the period end.`}
              </AppText>
            ) : null}
          </Card>
        )}

        {limits ? (
          <TileRow>
            <StatTile
              label="Clients"
              value={limits.limits.maxClients ? `${limits.usage.clients}/${limits.limits.maxClients}` : limits.usage.clients}
              icon="people-outline"
            />
            <StatTile
              label="AI credits"
              value={
                limits.limits.aiCallsPerMonth
                  ? `${limits.usage.aiCallsThisMonth}/${limits.limits.aiCallsPerMonth}`
                  : limits.usage.aiCallsThisMonth
              }
              icon="sparkles-outline"
              tint={limits.remaining.aiCallsThisMonth === 0 ? t.colors.danger : undefined}
            />
            <StatTile
              label="Team"
              value={limits.limits.maxTeam ? `${limits.usage.team}/${limits.limits.maxTeam}` : limits.usage.team}
              icon="people-circle-outline"
            />
          </TileRow>
        ) : null}
      </View>

      <SegmentedTabs
        options={[
          { key: 'plan', label: 'Plans' },
          { key: 'topups', label: 'Top-ups' },
          { key: 'invoices', label: 'Invoices' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {tab === 'plan' ? (
          plansQ.isLoading ? (
            <Loading />
          ) : (
            <>
              {plans.map((p) => {
                const current = sub?.plan_key === p.key;
                return (
                  <Card key={p.key} style={{ gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <AppText variant="heading" style={{ flex: 1 }}>
                        {p.name}
                      </AppText>
                      {current ? <Pill label="Current" tone="success" /> : null}
                      {p.recommended && !current ? <Pill label="Popular" tone="accent" /> : null}
                    </View>
                    <AppText variant="title">{inr(p.priceInr)}<AppText variant="muted" tone="muted">{' /month'}</AppText></AppText>
                    {p.priceInrAnnual ? (
                      <AppText variant="caption" tone="faint">
                        {`${inr(p.priceInrAnnual)} billed annually`}
                      </AppText>
                    ) : null}
                    <AppText variant="muted" tone="muted">
                      {p.tagline}
                    </AppText>
                    {p.features.slice(0, 6).map((f, i) => (
                      <AppText key={i} variant="muted" tone="muted">
                        · {f}
                      </AppText>
                    ))}
                    {p.setupFeeInr ? (
                      <AppText variant="caption" tone="faint">
                        {`One-time setup ${inr(p.setupFeeInr)}`}
                      </AppText>
                    ) : null}
                    {!current ? (
                      <View style={{ gap: spacing.sm }}>
                        {sub ? (
                          <ActionButton
                            label="Preview change"
                            icon="swap-horizontal-outline"
                            tone="neutral"
                            onPress={() => setPreviewFor(p.key)}
                          />
                        ) : null}
                        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                          <View style={{ flex: 1 }}>
                            <ActionButton
                              label="Monthly"
                              loading={startSubscription.isPending}
                              onPress={() => startSubscription.mutate({ planKey: p.key, cycle: 'monthly' })}
                            />
                          </View>
                          {p.priceInrAnnual ? (
                            <View style={{ flex: 1 }}>
                              <ActionButton
                                label="Annual"
                                tone="neutral"
                                loading={startSubscription.isPending}
                                onPress={() => startSubscription.mutate({ planKey: p.key, cycle: 'annual' })}
                              />
                            </View>
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                  </Card>
                );
              })}

              {sub && !sub.cancelled_at ? (
                <ActionButton
                  label="Cancel subscription"
                  icon="close-circle-outline"
                  tone="danger"
                  loading={cancel.isPending}
                  onPress={() =>
                    Alert.alert(
                      'Cancel subscription?',
                      'Your plan stays active until the end of the current billing period, then drops to the free tier.',
                      [
                        { text: 'Keep it', style: 'cancel' },
                        { text: 'Cancel plan', style: 'destructive', onPress: () => cancel.mutate() },
                      ],
                    )
                  }
                />
              ) : null}
            </>
          )
        ) : null}

        {tab === 'topups' ? (
          !plansQ.data?.topups.length ? (
            <EmptyState icon="cart-outline" title="No top-ups available" />
          ) : (
            plansQ.data.topups.map((tu) => (
              <Card key={tu.key} style={{ gap: spacing.sm }}>
                <AppText variant="heading">{tu.name}</AppText>
                <AppText variant="muted" tone="muted">
                  {tu.description}
                </AppText>
                <AppText variant="title">{inr(tu.priceInr)}</AppText>
                <AppText variant="caption" tone="faint">
                  {`${tu.units} ${tu.unitLabel}`}
                </AppText>
                <ActionButton
                  label="Buy"
                  icon="cart-outline"
                  loading={startTopup.isPending}
                  onPress={() => startTopup.mutate(tu.key)}
                />
              </Card>
            ))
          )
        ) : null}

        {tab === 'invoices' ? (
          invoicesQ.isLoading ? (
            <Loading />
          ) : !invoicesQ.data?.invoices.length ? (
            <EmptyState icon="receipt-outline" title="No invoices yet" />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {invoicesQ.data.invoices.map((inv) => (
                <ListRow
                  key={inv.id}
                  title={inv.invoice_number ?? inv.id}
                  subtitle={dateTime(inv.issued_at ?? inv.created_at)}
                  icon="receipt-outline"
                  meta={inr(inv.amount_paise + inv.gst_amount_paise, { fromPaise: true })}
                  onPress={() => void openInvoice(inv.id)}
                />
              ))}
            </Card>
          )
        ) : null}
      </View>

      <ProrationSheet planKey={previewFor} onClose={() => setPreviewFor(null)} />

      {pending && plansQ.data?.razorpayKeyId ? (
        <RazorpayCheckout
          visible
          keyId={plansQ.data.razorpayKeyId}
          orderId={pending.kind === 'topup' ? pending.orderId : undefined}
          subscriptionId={pending.kind === 'subscription' ? pending.subscriptionId : undefined}
          amountPaise={pending.kind === 'topup' ? pending.amountPaise : undefined}
          name="SIRAH LIFE"
          description={pending.label}
          prefillEmail={user?.email ?? undefined}
          onSuccess={(r) => void onCheckoutSuccess(r)}
          onDismiss={() => setPending(null)}
          onError={(m) => {
            setPending(null);
            Alert.alert('Payment failed', m);
          }}
        />
      ) : null}
    </OwnerPage>
  );
}

/**
 * Invoice PDFs are generated server-side; the mobile app hands the signed URL
 * to the system browser rather than reimplementing the web's jsPDF renderer.
 */
async function openInvoice(id: string) {
  try {
    const { invoice } = await billingApi.getInvoice(id);
    const url = (invoice as { pdf_url?: string | null }).pdf_url;
    if (url) {
      await WebBrowser.openBrowserAsync(url);
    } else {
      Alert.alert('No PDF yet', 'This invoice has no generated PDF. Download it from the web app.');
    }
  } catch (e) {
    Alert.alert('Could not open invoice', e instanceof Error ? e.message : 'Please try again.');
  }
}

function ProrationSheet({ planKey, onClose }: { planKey: PlanKey | null; onClose: () => void }) {
  const qc = useQueryClient();

  const previewQ = useQuery({
    queryKey: ['billing', 'change-preview', planKey],
    queryFn: () => billingApi.changePlanPreview(planKey!),
    enabled: !!planKey,
  });

  const change = useMutation({
    mutationFn: () => billingApi.changePlan(planKey!),
    onSuccess: (res) => {
      void qc.invalidateQueries();
      onClose();
      Alert.alert(
        'Plan changed',
        `${titleCase(res.direction)} applied ${res.timing === 'now' ? 'immediately' : 'at the next renewal'}.`,
      );
    },
    onError: (e: Error) => Alert.alert('Could not change plan', e.message),
  });

  const p = previewQ.data?.preview as Record<string, unknown> | undefined;

  return (
    <Sheet visible={!!planKey} onClose={onClose} title={`Change to ${titleCase(planKey ?? '')}`}>
      {previewQ.isLoading ? (
        <Loading label="Working out the difference" />
      ) : previewQ.isError ? (
        <QueryError error={previewQ.error} onRetry={() => void previewQ.refetch()} />
      ) : p ? (
        <Card style={{ gap: spacing.xs }}>
          {Object.entries(p).map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="muted" tone="muted">
                {titleCase(k)}
              </AppText>
              <AppText variant="muted">
                {typeof v === 'number' && k.toLowerCase().includes('paise')
                  ? inr(v, { fromPaise: true })
                  : String(v ?? '—')}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}
      <ActionButton
        label="Confirm change"
        loading={change.isPending}
        disabled={previewQ.isLoading || previewQ.isError}
        onPress={() => change.mutate()}
      />
    </Sheet>
  );
}
