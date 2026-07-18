import { useCallback, useEffect, useRef } from 'react';

/**
 * useRazorpayCheckout — lazy-loads Razorpay's Checkout SDK from their CDN
 * the first time the user opens a checkout modal. We don't bundle the SDK
 * because (a) it's ~80KB unused on every other page, (b) Razorpay updates
 * it server-side, and (c) their docs explicitly recommend the CDN load.
 *
 * Exposes a single `openCheckout(options)` function that returns a Promise
 * resolving with the payment response (verified server-side separately)
 * or rejecting with a CheckoutError. Caller handles UI feedback.
 */

const RAZORPAY_SDK_URL = 'https://checkout.razorpay.com/v1/checkout.js';

declare global {
  // The SDK attaches a global constructor.
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

interface RazorpayConstructor {
  new (options: RazorpayOptions): RazorpayInstance;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (resp: { error: RazorpayError }) => void): void;
}

interface RazorpayOptions {
  key: string;
  amount?: number;
  currency?: string;
  name: string;
  description?: string;
  order_id?: string;
  subscription_id?: string;
  image?: string;
  prefill?: { email?: string; contact?: string; name?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void; escape?: boolean };
}

/**
 * Response shape Razorpay hands back to the success handler.
 *
 * - One-time order flow → razorpay_order_id is set, razorpay_subscription_id is not
 * - Subscription flow   → razorpay_subscription_id is set, razorpay_order_id is not
 *
 * razorpay_signature is what we send to /verify (or /verify-subscription)
 * to confirm the payment is real before showing a success screen.
 */
export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature: string;
}

interface RazorpayError {
  code: string;
  description: string;
  source?: string;
  step?: string;
  reason?: string;
  metadata?: Record<string, string>;
}

export class CheckoutError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CheckoutError';
  }
}

export interface OpenCheckoutInput {
  /** Public Razorpay key id (rzp_test_XXX or rzp_live_XXX). */
  razorpayKeyId: string;
  /** Either an order_id (one-time) OR a subscription_id (recurring) — never both. */
  orderId?: string;
  subscriptionId?: string;
  amountPaise?: number;
  /** Plan/topup display name — shows at the top of the Razorpay modal. */
  productName: string;
  productDescription?: string;
  /** Prefill the contact form. */
  prefill?: { email?: string; name?: string; contact?: string };
  /** Echoed in Razorpay's records — used for support tracing. */
  notes?: Record<string, string>;
}

/**
 * Loads the SDK script once per page. Subsequent calls return the same
 * Promise so we don't double-inject the tag.
 */
function loadRazorpaySdk(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new CheckoutError('NO_WINDOW', 'Razorpay can only run in the browser.'));
  }
  if (window.Razorpay) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SDK_URL}"]`);
  if (existing && existing.dataset.loaded === 'true') return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    script.src = RAZORPAY_SDK_URL;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () =>
      reject(new CheckoutError('SDK_LOAD_FAILED', 'Razorpay Checkout SDK failed to load - check your network.'));
    if (!existing) document.body.appendChild(script);
  });
}

export function useRazorpayCheckout() {
  // Preload the SDK on hook mount so the first open() is instant. Useful
  // when /subscription is a likely next page after sign-in — the SDK is
  // already cached by the time the user clicks Pay.
  const preloadStarted = useRef(false);
  useEffect(() => {
    if (preloadStarted.current) return;
    preloadStarted.current = true;
    loadRazorpaySdk().catch(() => {
      // Swallow — we re-throw on actual openCheckout() call so caller
      // sees the error in context.
    });
  }, []);

  const openCheckout = useCallback(async (input: OpenCheckoutInput): Promise<RazorpaySuccessResponse> => {
    if (!input.razorpayKeyId) {
      throw new CheckoutError('NO_KEY', 'Razorpay is not configured. Set RAZORPAY_KEY_ID on the backend.');
    }
    if (!input.orderId && !input.subscriptionId) {
      throw new CheckoutError('NO_TARGET', 'openCheckout needs either orderId or subscriptionId.');
    }
    if (input.orderId && input.subscriptionId) {
      throw new CheckoutError('AMBIGUOUS_TARGET', 'openCheckout accepts orderId OR subscriptionId, not both.');
    }

    await loadRazorpaySdk();
    const Razorpay = window.Razorpay!;

    return new Promise<RazorpaySuccessResponse>((resolve, reject) => {
      const options: RazorpayOptions = {
        key: input.razorpayKeyId,
        name: 'SIRAH LIFE',
        description: input.productDescription ?? input.productName,
        image: '/favicon.svg',
        prefill: input.prefill,
        notes: input.notes,
        theme: { color: '#5b21b6' },
        modal: {
          escape: true,
          ondismiss: () => reject(new CheckoutError('USER_DISMISSED', 'You closed the payment window before completing.')),
        },
        handler: (response) => resolve(response),
      };

      if (input.orderId) {
        options.order_id = input.orderId;
        options.amount = input.amountPaise;
        options.currency = 'INR';
      } else {
        options.subscription_id = input.subscriptionId;
      }

      const instance = new Razorpay(options);
      instance.on('payment.failed', (resp) => {
        reject(new CheckoutError(resp.error.code, resp.error.description));
      });
      instance.open();
    });
  }, []);

  return { openCheckout };
}