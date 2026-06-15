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
  /** Disable on desktop or where it would fight a native scroll region. */
  disabled?: boolean;
}

const MAX_PULL = 120;

/**
 * PullToRefresh — native-style pull-to-refresh for mobile scroll views.
 *
 * Only engages when the inner scroll container is already at the top and the
 * user drags *down* with a touch (so it never hijacks normal scrolling or
 * mouse/trackpad use). Shows an elastic indicator that flips to a spinner past
 * the threshold; on release past threshold it awaits `onRefresh`.
 *
 * Pairs with `overscroll-behavior-y: none` (set globally in mobile-app.css) so
 * the browser's own pull-to-refresh doesn't double-fire.
 */
export function PullToRefresh({
  onRefresh,
  children,
  threshold = 70,
  className,
  disabled,
}: PullToRefreshProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const startY = React.useRef<number | null>(null);
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  const atTop = () => (containerRef.current?.scrollTop ?? 0) <= 0;

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled || refreshing) return;
    if (atTop()) startY.current = e.touches[0].clientY;
    else startY.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || disabled || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0 || !atTop()) {
      setPull(0);
      return;
    }
    // Rubber-band: resistance grows as you pull further.
    const damped = Math.min(MAX_PULL, delta * 0.5);
    setPull(damped);
  };

  const onTouchEnd = async () => {
    if (startY.current === null || disabled) return;
    startY.current = null;
    if (pull >= threshold && !refreshing) {
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
      ref={containerRef}
      className={cn("momentum-scroll relative h-full overflow-y-auto", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator — lives in the overscroll gap above the content. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center"
        style={{
          height: pull,
          opacity: pull > 4 ? 1 : 0,
          transition: startY.current === null ? "height 0.25s ease, opacity 0.2s" : undefined,
        }}
      >
        <div className="grid h-9 w-9 place-items-center rounded-full bg-canvas/90 text-foreground/70 shadow-md backdrop-blur">
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
          ) : (
            <ArrowDown
              className="h-4 w-4 text-violet-500 transition-transform"
              style={{ transform: `rotate(${progress >= 1 ? 180 : 0}deg)` }}
            />
          )}
        </div>
      </div>

      <div
        style={{
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: startY.current === null ? "transform 0.25s ease" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
