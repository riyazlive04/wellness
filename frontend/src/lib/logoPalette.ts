/**
 * Derive a brand palette from a practice's logo.
 *
 * Picking two hex values by hand is the part of white-label a nutritionist
 * will not do, so the colours stay on NUSI's defaults and the feature they
 * paid for looks like it does nothing. Their logo already carries the right
 * answer.
 *
 * Runs in the browser on a canvas: the logo is usually a data: URI on the
 * workspace row, so there is nothing to fetch and no server work.
 */

export interface LogoPalette {
  primary: string;
  accent: string;
}

/** `rgb(60, 80, 200)` -> `#3C50C8`. */
function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function hue(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const d = mx - mn;
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * The two colours that carry a logo's identity.
 *
 * Greys, near-blacks and near-whites are skipped: a mark on a dark tile would
 * otherwise return "black", which themes the app into mud. Candidates are
 * bucketed coarsely so antialiasing does not split one colour into fifty, and
 * the accent is the most common colour at least 40 degrees of hue away from
 * the primary - near enough and it is the same colour twice, which reads as
 * no gradient at all.
 */
export async function paletteFromLogo(src: string): Promise<LogoPalette | null> {
  if (!src) return null;

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    // Needed for any logo served from storage rather than inlined as a data:
    // URI, or the canvas is tainted and getImageData throws.
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = src;
  });
  if (!img) return null;

  // 64px is plenty for a dominant-colour read and keeps this well under a
  // frame even on a phone.
  const N = 64;
  const canvas = document.createElement('canvas');
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, N, N);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, N, N).data;
  } catch {
    return null;   // tainted canvas: a cross-origin logo without CORS headers
  }

  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 200) continue;

    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx - mn < 30) continue;   // grey, white, black: carries no hue
    if (mx < 50) continue;        // too dark to theme with
    if (mn > 225) continue;       // washed out

    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const cur = buckets.get(key);
    if (cur) {
      cur.n += 1;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  }

  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((c) => ({ ...c, r: c.r / c.n, g: c.g / c.n, b: c.b / c.n }));

  if (!ranked.length) return null;

  const first = ranked[0];
  const primary = hex(first.r, first.g, first.b);
  const h0 = hue(first.r, first.g, first.b);

  const second =
    ranked.slice(1).find((c) => {
      const d = Math.abs(hue(c.r, c.g, c.b) - h0);
      return Math.min(d, 360 - d) >= 40;
    }) ?? null;

  return {
    primary,
    // No second hue in the logo: a single-colour mark is a real answer, and
    // repeating the primary keeps the gradient subtle rather than inventing a
    // colour the practice never chose.
    accent: second ? hex(second.r, second.g, second.b) : primary,
  };
}
