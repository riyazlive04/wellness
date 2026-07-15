import * as React from "react";

/**
 * Device-tier detection for SIRAH LIFE's mobile-first architecture.
 *
 * The spec calls for *dedicated* behavior per tier — not scaled components.
 * `useIsMobile` (in ./use-mobile) already gates the single mobile/desktop
 * split that most of the app uses. This hook adds the **tablet** tier so
 * screens can opt into split-panel / multi-column tablet layouts.
 *
 * Breakpoints mirror Tailwind:
 *   mobile  : < 768px   (md)
 *   tablet  : 768–1023  (md..lg)
 *   desktop : >= 1024px (lg)
 */

export type DeviceType = "mobile" | "tablet" | "desktop";

const TABLET_MIN = 768; // Tailwind md
const DESKTOP_MIN = 1024; // Tailwind lg

function resolve(width: number): DeviceType {
  if (width < TABLET_MIN) return "mobile";
  if (width < DESKTOP_MIN) return "tablet";
  return "desktop";
}

/**
 * Returns the current device tier and re-renders on resize / orientation
 * change. SSR-safe: starts as `desktop` until the first client measurement
 * (the app is client-rendered, so this only matters for the first paint).
 */
export function useDeviceType(): DeviceType {
  const [device, setDevice] = React.useState<DeviceType>(() =>
    typeof window === "undefined" ? "desktop" : resolve(window.innerWidth),
  );

  React.useEffect(() => {
    const onChange = () => setDevice(resolve(window.innerWidth));
    // matchMedia is cheaper than a raw resize listener — fire on each boundary.
    const mqlTablet = window.matchMedia(`(min-width: ${TABLET_MIN}px)`);
    const mqlDesktop = window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`);
    mqlTablet.addEventListener("change", onChange);
    mqlDesktop.addEventListener("change", onChange);
    window.addEventListener("orientationchange", onChange);
    onChange();
    return () => {
      mqlTablet.removeEventListener("change", onChange);
      mqlDesktop.removeEventListener("change", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);

  return device;
}

/**
 * Convenience booleans for the common branches. `tabletUp` / `desktopUp`
 * follow Tailwind's min-width semantics so they read naturally next to
 * `md:`/`lg:` classes.
 */
export function useDevice() {
  const device = useDeviceType();
  return {
    device,
    isMobile: device === "mobile",
    isTablet: device === "tablet",
    isDesktop: device === "desktop",
    tabletUp: device !== "mobile",
    desktopUp: device === "desktop",
  };
}

/** Reactively matches an arbitrary media query (e.g. orientation, hover). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState<boolean>(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );
  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** True when the viewport is in portrait orientation. */
export function useIsPortrait(): boolean {
  return useMediaQuery("(orientation: portrait)");
}
