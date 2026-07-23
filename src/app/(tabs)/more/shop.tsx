import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { RazorpayCheckout, type RazorpaySuccess } from '@/components/razorpay-checkout';
import { AppText, Card, Eyebrow, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { inr, storeApi, type CheckoutResponse, type Product, type ProductOrder } from '@/lib/store-api';
import { radius, spacing } from '@/lib/theme';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  paid: 'success',
  fulfilled: 'success',
  pending: 'warning',
  failed: 'danger',
  cancelled: 'danger',
};

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
        razorpayOrderId: r.razorpay_order_id,
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
                <Ionicons name="bag-outline" size={26} color={t.colors.textFaint} />
                <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                  Your nutritionist hasn&apos;t listed any products yet.
                </AppText>
              </Card>
            ) : (
              <>
                <Eyebrow>Shop</Eyebrow>
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
  return (
    <Card style={{ gap: spacing.md }}>
      {p.image_url ? (
        <Image source={{ uri: p.image_url }} style={styles.image} contentFit="cover" />
      ) : null}
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="heading" style={{ flex: 1 }}>{p.name}</AppText>
          <View style={[styles.kind, { backgroundColor: t.colors.surfaceStrong }]}>
            <AppText variant="caption" tone="faint">{p.kind}</AppText>
          </View>
        </View>
        {p.description ? <AppText variant="muted" tone="muted">{p.description}</AppText> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="title">{inr(p.price_paise)}</AppText>
        {p.compare_at_paise ? (
          <AppText variant="muted" tone="faint" style={{ textDecorationLine: 'line-through' }}>
            {inr(p.compare_at_paise)}
          </AppText>
        ) : null}
        {p.stock_quantity != null ? (
          <AppText variant="caption" tone={out ? 'danger' : 'muted'} style={{ marginLeft: 'auto' }}>
            {out ? 'Out of stock' : `${p.stock_quantity} left`}
          </AppText>
        ) : null}
      </View>

      {!out ? (
        <>
          <View style={styles.qtyRow}>
            <Pressable onPress={() => onQty(-1)} style={[styles.qtyBtn, { backgroundColor: t.colors.surfaceStrong }]}>
              <Ionicons name="remove" size={18} color={t.colors.text} />
            </Pressable>
            <AppText variant="body" style={{ minWidth: 40, textAlign: 'center' }}>{qty}</AppText>
            <Pressable onPress={() => onQty(1)} style={[styles.qtyBtn, { backgroundColor: t.colors.surfaceStrong }]}>
              <Ionicons name="add" size={18} color={t.colors.text} />
            </Pressable>
            <AppText variant="muted" tone="muted" style={{ marginLeft: 'auto' }}>
              Total {inr(p.price_paise * qty)}
            </AppText>
          </View>
          <GradientButton label={busy ? 'Starting…' : 'Buy now'} onPress={onBuy} loading={busy} />
        </>
      ) : null}
    </Card>
  );
}

function OrderRow({ o }: { o: ProductOrder }) {
  return (
    <Card style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="body" style={{ flex: 1 }}>{o.product_name}</AppText>
        <AppText variant="body">{inr(o.amount_paise)}</AppText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <AppText variant="caption" tone={STATUS_TONE[o.status] ?? 'muted'} style={{ textTransform: 'uppercase' }}>
          {o.status}
        </AppText>
        <AppText variant="caption" tone="faint">
          ×{o.quantity} · {new Date(o.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 160, borderRadius: radius.md, backgroundColor: '#0002' },
  kind: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
