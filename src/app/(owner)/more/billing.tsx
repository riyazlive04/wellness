/**
 * Billing — READ-ONLY on mobile (Google Play compliance).
 *
 * Google Play requires in-app purchases of digital goods (the SaaS plan and
 * AI-credit top-ups) to go through Play Billing, so the mobile app does NOT
 * sell, upgrade, or top up. It shows the current subscription, usage, billing
 * alerts and GST invoices, and lets the owner cancel (a management action, not
 * a purchase). Plan changes and top-ups happen on the web dashboard.
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
  StatTile,
  TileRow,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useOwner } from '@/contexts/owner-context';
import { useTheme } from '@/hooks/use-theme';
import { billingApi } from '@/lib/owner/api/billing';
import { tenancyApi } from '@/lib/owner/api/tenancy';
import { dateTime, inr, shortDate, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

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
  const { scope } = useOwner();
  const [refreshing, setRefreshing] = useState(false);

  const subQ = useQuery({ queryKey: ['billing', 'subscription'], queryFn: billingApi.currentSubscription });
  const invoicesQ = useQuery({ queryKey: ['billing', 'invoices'], queryFn: billingApi.listInvoices });
  const limitsQ = useQuery({ queryKey: ['tenancy', 'limits'], queryFn: tenancyApi.getLimits });
  const notifQ = useQuery({ queryKey: ['billing', 'notifications'], queryFn: billingApi.listNotifications });

  const cancel = useMutation({
    mutationFn: () => billingApi.cancel(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['billing'] });
      Alert.alert('Cancelled', 'Your plan stays active until the end of the current period.');
    },
    onError: (e: Error) => Alert.alert('Could not cancel', e.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([subQ.refetch(), invoicesQ.refetch(), limitsQ.refetch(), notifQ.refetch()]);
    setRefreshing(false);
  };

  const sub = subQ.data?.subscription ?? null;
  const limits = limitsQ.data;
  const unreadNotifs = notifQ.data?.unread ?? 0;

  return (
    <OwnerPage
      title="Billing"
      subtitle={sub ? `${titleCase(sub.plan_key)} · ${titleCase(sub.status)}` : 'No active subscription'}
      back
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />}
      contentStyle={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
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
              onPress={() => void billingApi.markAllNotificationsRead().then(() => notifQ.refetch())}
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

        {sub && sub.status === 'active' && !sub.cancelled_at ? (
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
      </View>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: spacing.lg }}>
        <AppText variant="label" tone="muted">
          INVOICES
        </AppText>
        {invoicesQ.isLoading ? (
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
        )}
      </View>
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
