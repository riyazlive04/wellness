import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { clientsApi } from '@/modules/workspace/api/clients';

const STORAGE_KEY = 'notification-primer-dismissed';
const PROMPT_DELAY_MS = 2500;          // let the portal settle before priming
const REASK_MS = 7 * 24 * 60 * 60 * 1000; // re-ask after 7 days

// iOS only allows web push from an installed PWA (Add to Home Screen), so we
// skip the primer there until the app is launched in standalone mode.
function iosBlocked(): boolean {
  if (typeof navigator === 'undefined') return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!isIOS) return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    || (navigator as unknown as { standalone?: boolean }).standalone;
  return !standalone;
}

/**
 * NotificationPrimer — a full-screen, Viator-style opt-in that primes the user
 * before we fire the OS permission prompt. Shows a phone mockup with a sample
 * SIRAH push (real /sirah-logo.png), a headline and the two CTAs.
 *
 * Reuses usePushSubscription so the subscription lands in push_subscriptions
 * against the server's VAPID key, exactly like the small NotificationPrompt.
 */
export function NotificationPrimer() {
  const [open, setOpen] = useState(false);
  const { status, busy, subscribe } = usePushSubscription(clientsApi);

  useEffect(() => {
    // Only prime when we genuinely can subscribe.
    if (status !== 'idle' || iosBlocked()) return;

    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      const at = parseInt(dismissed, 10);
      if (Number.isFinite(at) && Date.now() - at < REASK_MS) return;
    }

    const t = setTimeout(() => setOpen(true), PROMPT_DELAY_MS);
    return () => clearTimeout(t);
  }, [status]);

  // Close automatically the moment we become subscribed.
  useEffect(() => { if (status === 'subscribed') setOpen(false); }, [status]);

  const dismiss = () => {
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  };

  const enable = async () => {
    try {
      await subscribe(); // browser prompt fires here; closes via the effect above
    } catch (err) {
      toast.error((err as Error).message || 'Could not turn on notifications.');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="primer-backdrop"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
        >
          <motion.div
            key="primer-card"
            className="relative w-full max-w-md rounded-t-3xl bg-background px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-8 shadow-2xl sm:rounded-3xl sm:pb-8"
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-foreground/40 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/70"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Phone mockup with a sample SIRAH notification */}
            <PhoneMockup />

            <h2 className="mt-7 text-center text-2xl font-bold text-foreground">
              Never miss a thing
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-center text-sm text-muted-foreground">
              Get reminders for new messages, meal plans and appointment updates
              from your nutritionist — even when the app is closed.
            </p>

            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="cta-glow mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-[15px] font-semibold text-white transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? 'Turning on…' : 'Turn on notifications'}
            </button>

            <button
              type="button"
              onClick={dismiss}
              className="mt-3 h-10 w-full text-center text-sm font-semibold text-foreground/70 transition-colors hover:text-foreground"
            >
              Not now
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The little iPhone frame + sample SIRAH push, matching the reference design. */
function PhoneMockup() {
  return (
    <div className="mx-auto w-[228px]">
      <div className="relative rounded-[2.4rem] border-[6px] border-neutral-900 bg-neutral-900 shadow-xl dark:border-neutral-700 dark:bg-neutral-800">
        {/* Screen — soft SIRAH-tinted wash */}
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-[hsl(var(--brand-blue)/0.10)] to-[hsl(var(--brand-magenta)/0.10)] pb-10 pt-9">
          {/* Notch */}
          <div className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-full bg-neutral-900" />

          {/* Primary notification */}
          <motion.div
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.35 }}
            className="mx-3 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-black/5 backdrop-blur"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-black/10">
                <img src="/sirah-logo.png" alt="" className="h-full w-full object-contain" />
              </div>
              <span className="text-[13px] font-bold text-neutral-900">Sirah Nutrition</span>
              <span className="ml-auto text-[10px] text-neutral-400">now</span>
            </div>
            <p className="mt-1.5 text-[13px] font-bold leading-snug text-neutral-900">
              🎉 Your meal plan is ready!
            </p>
            <p className="text-[12px] leading-snug text-neutral-500">
              Tap to see what’s planned for today.
            </p>
          </motion.div>

          {/* Faded stacked notification behind, for depth */}
          <div className="mx-5 mt-1.5 h-8 rounded-2xl bg-white/60 shadow-sm ring-1 ring-black/5" />
        </div>
      </div>
    </div>
  );
}
