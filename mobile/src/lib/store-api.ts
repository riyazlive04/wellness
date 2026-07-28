/**
 * Storefront — products the client's nutritionist sells, and the client's
 * orders. Ported from the web storeApi (client routes only; the owner catalog
 * routes are deliberately omitted).
 *
 * Money is paise integers on the wire — always format with inr().
 */
import { api } from '@/lib/api';

export type ProductKind = 'physical' | 'digital' | 'service';
export type ProductStatus = 'draft' | 'published' | 'archived';
export type ProductOrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'fulfilled';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  kind: ProductKind;
  price_paise: number;
  compare_at_paise: number | null;
  currency: string;
  image_url: string | null;
  status: ProductStatus;
  /** null = unlimited stock */
  stock_quantity: number | null;
}

export interface ProductOrder {
  id: string;
  product_id: string;
  quantity: number;
  product_name: string;
  unit_price_paise: number;
  amount_paise: number;
  currency: string;
  status: ProductOrderStatus;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
}

export interface CheckoutResponse {
  productOrderId: string;
  /** Razorpay order id — feed into the checkout sheet. */
  orderId: string;
  amountPaise: number;
  currency: string;
  razorpayKeyId: string | null;
  product: { id: string; name: string; kind: ProductKind };
  quantity: number;
}

/** ₹ with Indian digit grouping, from paise. */
export function inr(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

export const storeApi = {
  storefront: () => api.get<Product[]>('/api/v1/me/store/products'),
  myOrders: () => api.get<ProductOrder[]>('/api/v1/me/store/orders'),
  checkout: (body: { productId: string; quantity?: number }) =>
    api.post<CheckoutResponse>('/api/v1/me/store/checkout', { body }),
  verify: (body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    api.post<{ verified: true }>('/api/v1/me/store/verify', { body }),
};
