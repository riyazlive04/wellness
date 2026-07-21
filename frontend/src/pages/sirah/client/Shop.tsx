import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Boxes,
  Check,
  Clock,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { Glass, fadeUp, stagger } from '@/design-system';
import { clientsApi } from '@/modules/workspace/api/clients';
import { storeApi, inr, type Product, type ProductOrder } from '@/modules/workspace/api/store';
import { useRazorpayCheckout, CheckoutError } from '@/hooks/useRazorpayCheckout';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<Product['kind'], string> = {
  physical: 'Delivered to you',
  digital: 'Instant download',
  service: 'Session with your coach',
};

/**
 * Client storefront — buy what your nutritionist sells.
 *
 * Payment mirrors the owner Billing top-up flow: create an order server-side,
 * open Razorpay Checkout, verify the signature. Fulfilment is NOT done here —
 * the Razorpay webhook flips the order to paid, so a closed modal buys nothing.
 */
export default function ClientShop() {
  const qc = useQueryClient();
  const { openCheckout } = useRazorpayCheckout();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  const profileQ = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => clientsApi.myProfile(),
    retry: 1,
  });
  const productsQ = useQuery({
    queryKey: ['me', 'store', 'products'],
    queryFn: () => storeApi.storefront(),
    retry: 1,
  });
  const ordersQ = useQuery({
    queryKey: ['me', 'store', 'orders'],
    queryFn: () => storeApi.myOrders(),
    retry: 1,
  });

  const products = productsQ.data ?? [];
  const orders = ordersQ.data ?? [];

  const qtyOf = (id: string) => qty[id] ?? 1;
  const bump = (p: Product, delta: number) => {
    const max = p.stock_quantity ?? 99;
    setQty((s) => ({ ...s, [p.id]: Math.min(max, Math.max(1, qtyOf(p.id) + delta)) }));
  };

  async function buy(p: Product) {
    setPendingId(p.id);
    try {
      const created = await storeApi.checkout({ productId: p.id, quantity: qtyOf(p.id) });
      if (!created.razorpayKeyId) {
        toast.error('Payments aren’t set up yet', {
          description: 'Ask your nutritionist to finish connecting payments.',
        });
        return;
      }

      const res = await openCheckout({
        razorpayKeyId: created.razorpayKeyId,
        orderId: created.orderId,
        amountPaise: created.amountPaise,
        productName: p.name,
        productDescription: p.description ?? undefined,
        prefill: { name: profileQ.data?.name ?? undefined },
        notes: { product_order_id: created.productOrderId },
      });

      await storeApi.verify({
        razorpayOrderId: res.razorpay_order_id!,
        razorpayPaymentId: res.razorpay_payment_id,
        razorpaySignature: res.razorpay_signature,
      });

      toast.success(`Payment received — ${p.name}`, {
        description: 'Your nutritionist has been notified. Your order appears below in a moment.',
      });
      setQty((s) => ({ ...s, [p.id]: 1 }));
      void qc.invalidateQueries({ queryKey: ['me', 'store'] });
      // Fulfilment lands via webhook a beat later — refetch once more so the
      // status flips from Processing to Paid without a manual reload.
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['me', 'store', 'orders'] }), 4000);
    } catch (err) {
      if (err instanceof CheckoutError && err.code === 'USER_DISMISSED') return; // silent
      toast.error(err instanceof Error ? err.message : 'Could not complete payment.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <ClientLayout
      firstName={profileQ.data?.name?.split(' ')[0]}
      onRefresh={() => qc.invalidateQueries({ queryKey: ['me', 'store'] })}
    >
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10"
      >
        <motion.header variants={fadeUp} className="mb-6">
          <span className="text-[11px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
            Shop
          </span>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight md:text-3xl">
            From your nutritionist
          </h1>
          <p className="mt-1.5 text-sm text-foreground/60">
            Supplements, plans and sessions — pay securely, and your coach is notified straight away.
          </p>
        </motion.header>

        {/* ---- catalog ---- */}
        {productsQ.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Glass key={i} className="h-56 animate-pulse p-5" />
            ))}
          </div>
        ) : productsQ.isError ? (
          <Glass className="p-6 text-sm text-foreground/70">
            Couldn’t load the shop. Pull to refresh, or try again shortly.
          </Glass>
        ) : products.length === 0 ? (
          <motion.div variants={fadeUp}>
            <Glass className="flex flex-col items-center gap-2 p-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-foreground/[0.05]">
                <ShoppingBag className="h-5 w-5 text-foreground/50" />
              </span>
              <div className="mt-1 text-sm font-medium">Nothing on sale yet</div>
              <p className="max-w-sm text-xs text-foreground/55">
                Your nutritionist hasn’t listed any products. They’ll show up here as soon as they do.
              </p>
            </Glass>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {products.map((p) => {
              const soldOut = p.stock_quantity !== null && p.stock_quantity <= 0;
              const busy = pendingId === p.id;
              return (
                <motion.div key={p.id} variants={fadeUp}>
                  <Glass className="flex h-full flex-col overflow-hidden p-0">
                    <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.14)] to-[hsl(var(--brand-magenta)_/_0.14)]">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center">
                          <Package className="h-8 w-8 text-foreground/25" />
                        </span>
                      )}
                      {p.compare_at_paise != null && p.compare_at_paise > p.price_paise && (
                        <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white">
                          Save {inr(p.compare_at_paise - p.price_paise)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-semibold leading-snug">{p.name}</h3>
                        <div className="shrink-0 text-right">
                          <div className="text-base font-semibold">{inr(p.price_paise)}</div>
                          {p.compare_at_paise != null && p.compare_at_paise > p.price_paise && (
                            <div className="text-[11px] text-foreground/40 line-through">
                              {inr(p.compare_at_paise)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-foreground/50">
                        <Sparkles className="h-3 w-3" />
                        {KIND_LABEL[p.kind]}
                      </div>

                      {p.description && (
                        <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-foreground/60">
                          {p.description}
                        </p>
                      )}

                      {p.stock_quantity !== null && !soldOut && p.stock_quantity <= 5 && (
                        <div className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          Only {p.stock_quantity} left
                        </div>
                      )}

                      <div className="mt-auto flex items-center gap-2 pt-4">
                        {!soldOut && (
                          <div className="flex items-center rounded-full border border-foreground/10">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              onClick={() => bump(p, -1)}
                              disabled={qtyOf(p.id) <= 1 || busy}
                              className="grid h-8 w-8 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/[0.06] disabled:opacity-40"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-[1.5rem] text-center text-sm tabular-nums">
                              {qtyOf(p.id)}
                            </span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              onClick={() => bump(p, 1)}
                              disabled={busy || qtyOf(p.id) >= (p.stock_quantity ?? 99)}
                              className="grid h-8 w-8 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/[0.06] disabled:opacity-40"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => void buy(p)}
                          disabled={soldOut || busy}
                          className={cn(
                            'inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-transform',
                            soldOut
                              ? 'cursor-not-allowed bg-foreground/[0.06] text-foreground/40'
                              : 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white cta-glow hover:scale-[1.02] active:scale-[0.97]',
                          )}
                        >
                          {busy ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Opening…
                            </>
                          ) : soldOut ? (
                            'Sold out'
                          ) : (
                            <>Buy · {inr(p.price_paise * qtyOf(p.id))}</>
                          )}
                        </button>
                      </div>
                    </div>
                  </Glass>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ---- purchase history ---- */}
        {orders.length > 0 && (
          <motion.section variants={fadeUp} className="mt-10">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Boxes className="h-4 w-4 text-foreground/50" /> Your orders
            </h2>
            <Glass className="divide-y divide-foreground/[0.06] p-0">
              {orders.map((o) => (
                <OrderRow key={o.id} order={o} />
              ))}
            </Glass>
          </motion.section>
        )}
      </motion.div>
    </ClientLayout>
  );
}

function OrderRow({ order }: { order: ProductOrder }) {
  const paid = order.status === 'paid' || order.status === 'fulfilled';
  const processing = order.status === 'pending';
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {order.product_name}
          {order.quantity > 1 && (
            <span className="ml-1.5 text-xs text-foreground/50">x{order.quantity}</span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-foreground/45">
          {new Date(order.created_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-semibold tabular-nums">{inr(order.amount_paise)}</span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold',
            order.status === 'fulfilled' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
            order.status === 'paid' && 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
            processing && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
            !paid && !processing && 'bg-foreground/[0.06] text-foreground/50',
          )}
        >
          {order.status === 'fulfilled' ? (
            <>
              <Check className="h-3 w-3" /> Delivered
            </>
          ) : order.status === 'paid' ? (
            <>
              <Check className="h-3 w-3" /> Paid
            </>
          ) : processing ? (
            <>
              <Clock className="h-3 w-3" /> Processing
            </>
          ) : (
            order.status
          )}
        </span>
      </div>
    </div>
  );
}
