import * as React from "react";
import { Loader2, ArrowDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  /** Called when the user pulls past the threshold and releases. */
  onRefresh: () => Promise<unknown> | void;
  children: React.ReactNode;
  /** Pixels the user must drag before a release triggers a refresh. */
  threshold?: number;
  className?: string;
  /** Disable (e.g. on desktop or where it would fight a native scroll region). */
  disabled?: boolean;
}

const MAX_PULL = 110;

/**
 * PullToRefresh — native-style pull-to-refresh for the document-scroll layout
 * SIRAH LIFE uses (pages scroll the window, not an inner container).
 *
 * Engages only when (a) it's a touch gesture, (b) the window is scrolled to the
 * very top, and (c) the user drags downward — so it never hijacks normal
 * scrolling or desktop mouse/trackpad use. Shows an elastic indicator that
 * flips to a spinner past the threshold; on release past threshold it awaits
 * `onRefresh`.
 *
 * Relies on `overscroll-behavior-y: none` (set globally in mobile-app.css) so
 * the browser's own pull-to-refresh doesn't double-fire on Android/Chrome.
 */
export function PullToRefresh({
  onRefresh,
  children,
  threshold = 70,
  className,
  disabled,
}: PullToRefreshProps) {
  const startY = React.useRef<number | null>(null);
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const settling = startY.current === null;

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled || refreshing) return;
    startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || disabled || refreshing) return;
    // If the page started scrolling, abandon the gesture.
    if (window.scrollY > 0) {
      startY.current = null;
      setPull(0);
      return;
    }
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    // Rubber-band: resistance grows the further you pull.
    setPull(Math.min(MAX_PULL, delta * 0.5));
  };

  const onTouchEnd = async () => {
    if (startY.current === null || disabled) return;
    const reached = pull >= threshold;
    startY.current = null;
    if (reached && !refreshing) {
      setRefreshing(true);
      setPull(threshold);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  };

  const progress = Math.min(1, pull / threshold);

  return (
    <div
      className={cn("relative", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Indicator — fixed near the top of the viewport, fades/drops in on pull. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center md:hidden"
        style={{
          transform: `translateY(${pull > 0 || refreshing ? Math.max(pull, refreshing ? threshold : 0) - 8 : -48}px)`,
          opacity: pull > 4 || refreshing ? 1 : 0,
          paddingTop: "env(safe-area-inset-top)",
          transition: settling ? "transform 0.25s ease, opacity 0.2s" : undefined,
        }}
      >
        <div className="mt-2 grid h-9 w-9 place-items-center rounded-full bg-canvas/90 text-foreground/70 shadow-md backdrop-blur">
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
          ) : (
            <ArrowDown
              className="h-4 w-4 text-teal-500 transition-transform"
              style={{ transform: `rotate(${progress >= 1 ? 180 : 0}deg)` }}
            />
          )}
        </div>
      </div>

      <div
        style={{
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: settling ? "transform 0.25s ease" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
