import { api } from '@/lib/api';

/**
 * Product store API.
 *
 * Owner routes manage the catalog (`/workspaces/me/products`); client routes are
 * the storefront a client buys from (`/me/store`). Money is paise integers on
 * the wire — format with `inr()` below, never with raw division at call sites.
 */

export type ProductKind = 'physical' | 'digital' | 'service';
export type ProductStatus = 'draft' | 'published' | 'archived';
export type ProductOrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'fulfilled';

export interface Product {
  id: string;
  workspace_id: string;
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
  created_at: string;
  updated_at: string;
}

export interface ProductOrder {
  id: string;
  product_id: string;
  client_id: string | null;
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
  /** Only present on the owner's order list (joined from clients). */
  client_name?: string | null;
}

export interface ProductInput {
  name: string;
  description?: string;
  kind?: ProductKind;
  pricePaise: number;
  compareAtPaise?: number;
  imageUrl?: string;
  status?: ProductStatus;
  stockQuantity?: number;
}

export interface CheckoutResponse {
  productOrderId: string;
  /** Razorpay order id — feed straight into openCheckout(). */
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
  // ---- owner: catalog ----
  list: (includeArchived = false) =>
    api.get<Product[]>(
      `/api/v1/workspaces/me/products${includeArchived ? '?includeArchived=true' : ''}`,
    ),
  create: (body: ProductInput) => api.post<Product>('/api/v1/workspaces/me/products', { body }),
  update: (id: string, body: Partial<ProductInput>) =>
    api.patch<Product>(`/api/v1/workspaces/me/products/${id}`, { body }),
  remove: (id: string) =>
    api.delete<{ id: string; archived: boolean }>(`/api/v1/workspaces/me/products/${id}`),

  // ---- owner: orders ----
  orders: () => api.get<ProductOrder[]>('/api/v1/workspaces/me/products/orders/all'),
  fulfil: (id: string) =>
    api.post<ProductOrder>(`/api/v1/workspaces/me/products/orders/${id}/fulfil`),

  // ---- client: storefront ----
  storefront: () => api.get<Product[]>('/api/v1/me/store/products'),
  myOrders: () => api.get<ProductOrder[]>('/api/v1/me/store/orders'),
  checkout: (body: { productId: string; quantity?: number }) =>
    api.post<CheckoutResponse>('/api/v1/me/store/checkout', { body }),
  verify: (body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    api.post<{ verified: true }>('/api/v1/me/store/verify', { body }),
};
