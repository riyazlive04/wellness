import { useEffect } from 'react';
import { DEFAULT_PALETTE, useWorkspaceBrand } from './workspaceBrand';

/**
 * Brand theming — turn a workspace's single brand colour into an app-wide theme.
 *
 * The design system is driven by CSS custom properties on <html> (see
 * index.css: `--primary`, `--ring`, `--accent`, `--brand-*`, `--sidebar-*`,
 * expressed as `H S% L%` triples). By default those are static (SIRAH LIFE violet).
 * `useApplyBrandTheme()` overrides them from `brand_color` so buttons, active
 * states, focus rings, gradients and the client-portal accents all follow the
 * practice's colour — without changing the layout.
 *
 * It only re-themes when a workspace has actually chosen a custom colour; an
 * un-customised workspace keeps the default theme untouched.
 */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** #RGB or #RRGGBB → [h(0-360), s(0-100), l(0-100)]. */
function hexToHsl(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  const lig = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    sat = lig > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hue = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue /= 6;
  }
  return [Math.round(hue * 360), Math.round(sat * 100), Math.round(lig * 100)];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** The CSS variables this module owns — listed so we can cleanly revert them. */
const OWNED_VARS = [
  '--primary', '--primary-foreground', '--ring',
  '--accent', '--accent-foreground',
  '--sidebar-primary', '--sidebar-primary-foreground', '--sidebar-ring',
  '--brand-blue', '--brand-violet', '--brand-magenta',
  '--brand-primary', '--brand-accent',
];

/** Derive the full set of theme triples from one primary + accent colour. */
function deriveVars(primaryHex: string, accentHex: string, isDark: boolean): Record<string, string> {
  const [ph, ps, pl] = hexToHsl(primaryHex);
  const acc = HEX_RE.test(accentHex) ? accentHex : primaryHex;
  const [ah, as, al] = hexToHsl(acc);
  const primary = `${ph} ${ps}% ${pl}%`;
  const onPrimary = pl > 62 ? '222 47% 11%' : '0 0% 100%';
  const accentTri = `${ah} ${as}% ${al}%`;
  return {
    '--primary': primary,
    '--primary-foreground': onPrimary,
    '--ring': primary,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': onPrimary,
    '--sidebar-ring': primary,
    // Pale hover surface in light mode, deep in dark — kept on the brand hue.
    '--accent': isDark ? `${ph} 45% 24%` : `${ph} ${clamp(ps, 20, 90)}% 96%`,
    '--accent-foreground': isDark ? '0 0% 100%' : `${ph} ${clamp(ps, 30, 90)}% 30%`,
    // Gradient stops (BrandMark, canvas wash, CTAs): accent → primary → warm-primary.
    '--brand-blue': accentTri,
    '--brand-violet': primary,
    '--brand-magenta': `${(ph + 22) % 360} ${clamp(ps + 6, 0, 100)}% ${clamp(pl + 3, 0, 82)}%`,
    // Hex custom vars consumed by the client-portal shell.
    '--brand-primary': primaryHex,
    '--brand-accent': acc,
  };
}

/**
 * Apply the workspace brand colour app-wide. Mount once high in each shell
 * (OwnerLayout + ClientLayout). Re-derives on light/dark toggle and reverts its
 * overrides on unmount so non-shell routes (e.g. auth) stay on the base theme.
 */
export function useApplyBrandTheme(): void {
  const { palette } = useWorkspaceBrand();
  const primary = palette.primary;
  const accent = palette.accent;

  useEffect(() => {
    const root = document.documentElement;
    const isCustom =
      HEX_RE.test(primary) && primary.toLowerCase() !== DEFAULT_PALETTE.primary.toLowerCase();

    const apply = () => {
      if (!isCustom) {
        OWNED_VARS.forEach((k) => root.style.removeProperty(k));
        return;
      }
      const isDark = root.classList.contains('dark');
      const vars = deriveVars(primary, accent, isDark);
      Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    };

    apply();
    // Re-apply the correct shades when the theme flips light ↔ dark.
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => {
      mo.disconnect();
      OWNED_VARS.forEach((k) => root.style.removeProperty(k));
    };
  }, [primary, accent]);
}
