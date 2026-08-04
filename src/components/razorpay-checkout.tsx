import { Ionicons } from '@expo/vector-icons';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { spacing } from '@/lib/theme';

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  /** Present for one-off orders (store purchases, AI-credit top-ups). */
  razorpay_order_id?: string;
  /** Present for recurring plan subscriptions instead of an order id. */
  razorpay_subscription_id?: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutProps {
  visible: boolean;
  keyId: string;
  /** One-off payment. Mutually exclusive with `subscriptionId`. */
  orderId?: string;
  /**
   * Recurring plan checkout. Razorpay takes `subscription_id` in place of
   * `order_id` + `amount`, and returns `razorpay_subscription_id` on success —
   * which is what /billing/me/verify-subscription expects.
   */
  subscriptionId?: string;
  amountPaise?: number;
  currency?: string;
  name: string;
  description?: string;
  prefillName?: string;
  prefillEmail?: string;
  notes?: Record<string, string>;
  onSuccess: (r: RazorpaySuccess) => void;
  onDismiss: () => void;
  onError?: (message: string) => void;
}

/**
 * Razorpay checkout for React Native, via a WebView running Razorpay's official
 * checkout.js. We use this rather than a native SDK so no extra native module /
 * config plugin is needed — the page posts the success payload back through
 * window.ReactNativeWebView.postMessage, which we forward to /me/store/verify.
 */
export function RazorpayCheckout({
  visible,
  keyId,
  orderId,
  subscriptionId,
  amountPaise,
  currency = 'INR',
  name,
  description,
  prefillName,
  prefillEmail,
  notes,
  onSuccess,
  onDismiss,
  onError,
}: RazorpayCheckoutProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head><body style="margin:0;background:#0A0C10">
<script>
  function post(msg){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  var opts = {
    key: ${JSON.stringify(keyId)},
    ${subscriptionId
      ? `subscription_id: ${JSON.stringify(subscriptionId)},`
      : `amount: ${JSON.stringify(amountPaise ?? 0)},
    order_id: ${JSON.stringify(orderId ?? '')},`}
    currency: ${JSON.stringify(currency)},
    name: ${JSON.stringify(name)},
    description: ${JSON.stringify(description ?? '')},
    prefill: { name: ${JSON.stringify(prefillName ?? '')}, email: ${JSON.stringify(prefillEmail ?? '')} },
    notes: ${JSON.stringify(notes ?? {})},
    theme: { color: '#06B6D4' },
    modal: { ondismiss: function(){ post({ type: 'dismiss' }); } },
    handler: function(res){ post({ type: 'success', data: res }); }
  };
  try {
    var rzp = new window.Razorpay(opts);
    rzp.on('payment.failed', function(resp){
      post({ type: 'error', message: (resp && resp.error && resp.error.description) || 'Payment failed' });
    });
    rzp.open();
  } catch (e) { post({ type: 'error', message: String(e && e.message || e) }); }
</script></body></html>`;

  /**
   * Hand app-scheme URLs to the OS instead of the WebView.
   *
   * When the user picks UPI, Razorpay navigates to `upi://`, `intent://` or a
   * vendor scheme (`phonepe://`, `tez://`, `paytmmp://`) to launch that app. A
   * WebView can't load those and silently does nothing — which made UPI, the
   * dominant payment method in India, appear broken. Cards/netbanking are plain
   * https and stay in the WebView as normal.
   */
  const handleNavigation = (req: { url: string }): boolean => {
    const url = req.url ?? '';
    if (/^https?:/i.test(url) || url === 'about:blank' || url.startsWith('data:')) {
      return true; // normal checkout navigation — let the WebView handle it
    }
    Linking.openURL(url).catch(() => {
      onError?.('Could not open your UPI app. Try a card, or pick another app.');
    });
    return false;
  };

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as
        | { type: 'success'; data: RazorpaySuccess }
        | { type: 'dismiss' }
        | { type: 'error'; message: string };
      if (msg.type === 'success') onSuccess(msg.data);
      else if (msg.type === 'dismiss') onDismiss();
      else onError?.(msg.message);
    } catch {
      onError?.('Unexpected checkout response.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <View style={{ flex: 1, backgroundColor: t.colors.canvas }}>
        <View style={[styles.bar, { borderBottomColor: t.colors.border, paddingTop: insets.top + spacing.sm }]}>
          <AppText variant="heading" style={{ flex: 1 }}>Secure checkout</AppText>
          <Pressable onPress={onDismiss} hitSlop={10}>
            <Ionicons name="close" size={22} color={t.colors.textMuted} />
          </Pressable>
        </View>
        {visible ? (
          <WebView
            originWhitelist={['*']}
            source={{ html, baseUrl: 'https://checkout.razorpay.com' }}
            onMessage={handleMessage}
            onShouldStartLoadWithRequest={handleNavigation}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            mixedContentMode="always"
            thirdPartyCookiesEnabled
            style={{ flex: 1, backgroundColor: t.colors.canvas }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
