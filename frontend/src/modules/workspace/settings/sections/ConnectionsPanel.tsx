import { MessageCircle } from 'lucide-react';

/**
 * Per-workspace notification channels. Email was removed (transactional email
 * needs per-domain DNS verification, which isn't worth the friction for
 * practices). WhatsApp — each practice connecting its own number via QR — is
 * the planned channel and shows here as "coming soon". Staff still get in-app +
 * browser push out of the box.
 */
export function ConnectionsPanel() {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Your notification channels</h3>
        <p className="mt-0.5 text-xs text-foreground/60">
          Staff get in-app + browser push out of the box. Connect this practice's own WhatsApp number here soon.
        </p>
      </div>

      <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm opacity-90">
        <div className="flex items-start gap-4">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-emerald-400/5 text-emerald-700 dark:text-emerald-200">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">WhatsApp</span>
              <span className="rounded-full border border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-foreground/60">Coming soon</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-foreground/60">
              Connect this practice's own WhatsApp number by scanning a QR code. We're standing up the WhatsApp gateway — this will light up shortly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
