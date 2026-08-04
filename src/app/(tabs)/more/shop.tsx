import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { RazorpayCheckout, type RazorpaySuccess } from '@/components/razorpay-checkout';
import { AppText, Card, Eyebrow, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { inr, storeApi, type CheckoutResponse, type Product, type ProductOrder } from '@/lib/store-api';
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

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  paid: 'success',
  fulfilled: 'success',
  pending: 'warning',
  failed: 'danger',
  cancelled: 'danger',
};

const STATUS_COLOR: Record<string, string> = {
  paid: status.success,
  fulfilled: status.success,
  pending: status.warning,
  failed: status.danger,
  cancelled: status.danger,
};

/** Product-kind accent hue + icon, drawn from the teal/cyan/aqua brand family. */
function kindMeta(kind: string): { color: string; icon: IoniconName } {
  switch (kind) {
    case 'digital':
      return { color: brand.cyan, icon: 'cloud-download-outline' };
    case 'service':
      return { color: status.warning, icon: 'sparkles-outline' };
    default:
      return { color: brand.teal, icon: 'cube-outline' };
  }
}

export default function Shop() {
  const t = useTheme();
  const qc = useQueryClient();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState<{ res: CheckoutResponse; product: Product } | null>(null);

  const productsQ = useQuery({ queryKey: ['me', 'store', 'products'], queryFn: () => storeApi.storefront(), retry: 1 });
  const ordersQ = useQuery({ queryKey: ['me', 'store', 'orders'], queryFn: () => storeApi.myOrders(), retry: 1 });
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });

  const buyMut = useMutation({
    mutationFn: (p: Product) => storeApi.checkout({ productId: p.id, quantity: qty[p.id] ?? 1 }),
    onSuccess: (res, p) => {
      if (!res.razorpayKeyId) {
        Alert.alert('Payments not set up', 'Ask your nutritionist to finish connecting payments.');
        return;
      }
      setCheckout({ res, product: p });
    },
    onError: (e: Error) => Alert.alert('Could not start checkout', e.message),
  });

  const verifyMut = useMutation({
    mutationFn: (r: RazorpaySuccess) =>
      storeApi.verify({
        // Store purchases are always one-off orders, so Razorpay returns an
        // order id here (only plan subscriptions come back with a sub id).
        razorpayOrderId: r.razorpay_order_id!,
        razorpayPaymentId: r.razorpay_payment_id,
        razorpaySignature: r.razorpay_signature,
      }),
    onSuccess: () => {
      setCheckout(null);
      qc.invalidateQueries({ queryKey: ['me', 'store'] });
      Alert.alert('Payment received 🎉', 'Your nutritionist has been notified. Your order will appear below.');
      // Fulfilment lands via webhook a beat later — refetch once more.
      setTimeout(() => qc.invalidateQueries({ queryKey: ['me', 'store', 'orders'] }), 4000);
    },
    onError: (e: Error) => {
      setCheckout(null);
      Alert.alert('Payment verification failed', e.message);
    },
  });

  const products = (productsQ.data ?? []).filter((p) => p.status === 'published');
  const orders = ordersQ.data ?? [];
  const loading = productsQ.isLoading;

  const setQ = (id: string, delta: number) =>
    setQty((s) => ({ ...s, [id]: Math.max(1, (s[id] ?? 1) + delta) }));

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={productsQ.isRefetching} onRefresh={() => { productsQ.refetch(); ordersQ.refetch(); }} tintColor={t.colors.accent} />
        }>
        {loading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            {products.length === 0 ? (
              <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
                <View style={[styles.emptyChip, { backgroundColor: tint(brand.teal, t.dark ? 0.18 : 0.12) }]}>
                  <Ionicons name="bag-handle-outline" size={22} color={t.colors.primary} />
                </View>
                <AppText variant="heading">Nothing in the shop yet</AppText>
                <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                  Your nutritionist hasn&apos;t listed any products yet.
                </AppText>
              </Card>
            ) : (
              <>
                <View style={{ gap: 4 }}>
                  <Eyebrow>Shop</Eyebrow>
                  <AppText variant="title">Curated for you</AppText>
                  <AppText variant="muted" tone="muted">
                    Handpicked products and services from your nutritionist.
                  </AppText>
                </View>
                {products.map((p) => (
                  <ProductCard
                    key={p.id}
                    p={p}
                    qty={qty[p.id] ?? 1}
                    onQty={(d) => setQ(p.id, d)}
                    onBuy={() => buyMut.mutate(p)}
                    busy={buyMut.isPending && buyMut.variables?.id === p.id}
                  />
                ))}
              </>
            )}

            {orders.length ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                <Eyebrow>My orders</Eyebrow>
                {orders.map((o) => <OrderRow key={o.id} o={o} />)}
              </View>
            ) : null}
          </>
        )}
      </ScreenScroll>

      {checkout ? (
        <RazorpayCheckout
          visible
          keyId={checkout.res.razorpayKeyId as string}
          orderId={checkout.res.orderId}
          amountPaise={checkout.res.amountPaise}
          currency={checkout.res.currency}
          name={checkout.product.name}
          description={checkout.product.description ?? undefined}
          prefillName={profileQ.data?.name}
          prefillEmail={profileQ.data?.email}
          notes={{ product_order_id: checkout.res.productOrderId }}
          onSuccess={(r) => verifyMut.mutate(r)}
          onDismiss={() => setCheckout(null)}
          onError={(m) => { setCheckout(null); Alert.alert('Payment failed', m); }}
        />
      ) : null}
    </Screen>
  );
}

function ProductCard({ p, qty, onQty, onBuy, busy }: { p: Product; qty: number; onQty: (d: number) => void; onBuy: () => void; busy: boolean }) {
  const t = useTheme();
  const out = p.stock_quantity != null && p.stock_quantity <= 0;
  const meta = kindMeta(p.kind);
  const stockColor = out ? t.colors.danger : t.colors.success;

  return (
    <Card style={{ gap: spacing.md, borderRadius: radius['2xl'], overflow: 'hidden' }}>
      {p.image_url ? (
        <View style={styles.imageFrame}>
          <Image source={{ uri: p.image_url }} style={styles.image} contentFit="cover" />
        </View>
      ) : (
        <View style={[styles.imageFrame, styles.imagePlaceholder, { backgroundColor: tint(meta.color, t.dark ? 0.18 : 0.1) }]}>
          <Ionicons name={meta.icon} size={40} color={meta.color} />
        </View>
      )}

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={[styles.kindChip, { backgroundColor: tint(meta.color, t.dark ? 0.2 : 0.12) }]}>
            <Ionicons name={meta.icon} size={13} color={meta.color} />
            <AppText variant="caption" style={{ color: meta.color, textTransform: 'capitalize' }}>{p.kind}</AppText>
          </View>
          {p.stock_quantity != null ? (
            <View style={[styles.pill, { backgroundColor: tint(out ? status.danger : status.success, t.dark ? 0.2 : 0.12), marginLeft: 'auto' }]}>
              <Ionicons name={out ? 'close-circle-outline' : 'checkmark-circle-outline'} size={13} color={stockColor} />
              <AppText variant="caption" style={{ color: stockColor }}>
                {out ? 'Out of stock' : `${p.stock_quantity} left`}
              </AppText>
            </View>
          ) : null}
        </View>

        <AppText variant="heading">{p.name}</AppText>
        {p.description ? <AppText variant="muted" tone="muted">{p.description}</AppText> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <AppText variant="title">{inr(p.price_paise)}</AppText>
        {p.compare_at_paise ? (
          <AppText variant="muted" tone="faint" style={{ textDecorationLine: 'line-through', marginBottom: 3 }}>
            {inr(p.compare_at_paise)}
          </AppText>
        ) : null}
      </View>

      {!out ? (
        <>
          <View style={[styles.qtyRow, { backgroundColor: tint(brand.teal, t.dark ? 0.1 : 0.07), borderColor: t.colors.border }]}>
            <Pressable onPress={() => onQty(-1)} style={[styles.qtyBtn, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
              <Ionicons name="remove" size={18} color={t.colors.primary} />
            </Pressable>
            <AppText variant="heading" style={{ minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{qty}</AppText>
            <Pressable onPress={() => onQty(1)} style={[styles.qtyBtn, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
              <Ionicons name="add" size={18} color={t.colors.primary} />
            </Pressable>
            <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
              <AppText variant="caption" tone="faint">Total</AppText>
              <AppText variant="heading" tone="accent">{inr(p.price_paise * qty)}</AppText>
            </View>
          </View>
          <GradientButton label={busy ? 'Starting…' : 'Buy now'} onPress={onBuy} loading={busy} />
        </>
      ) : null}
    </Card>
  );
}

function OrderRow({ o }: { o: ProductOrder }) {
  const t = useTheme();
  const tone = STATUS_TONE[o.status] ?? 'muted';
  const dot = STATUS_COLOR[o.status] ?? t.colors.textFaint;
  return (
    <Card style={{ gap: spacing.sm, flexDirection: 'row', alignItems: 'center' }}>
      <View style={[styles.orderChip, { backgroundColor: tint(brand.cyan, t.dark ? 0.2 : 0.12) }]}>
        <Ionicons name="receipt-outline" size={18} color={t.colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="body" style={{ flex: 1 }} numberOfLines={1}>{o.product_name}</AppText>
          <AppText variant="heading">{inr(o.amount_paise)}</AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={[styles.statusPill, { backgroundColor: tint(STATUS_COLOR[o.status] ?? '#888888', t.dark ? 0.2 : 0.12) }]}>
            <View style={[styles.statusDot, { backgroundColor: dot }]} />
            <AppText variant="caption" tone={tone} style={{ textTransform: 'uppercase' }}>
              {o.status}
            </AppText>
          </View>
          <AppText variant="caption" tone="faint">
            ×{o.quantity} · {new Date(o.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  imageFrame: { width: '100%', height: 170, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#0002' },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  kindChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  emptyChip: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  orderChip: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
});
