/**
 * Display formatters for the owner surfaces.
 *
 * The web app leans on date-fns; that dependency isn't in the mobile bundle and
 * isn't worth adding for five functions. These are hand-rolled and defensive —
 * a bad/absent timestamp renders as an em dash rather than "Invalid Date".
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "12 Mar" — or "12 Mar 2025" when the year isn't the current one. */
export function shortDate(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '—';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

/** "12 Mar, 3:40 pm" */
export function dateTime(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '—';
  return `${shortDate(d)}, ${clockTime(d)}`;
}

/** "3:40 pm" */
export function clockTime(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '—';
  const h = d.getHours();
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(d.getMinutes())} ${suffix}`;
}

/** "just now" · "4m" · "3h" · "2d" · "5 Mar" past a fortnight. */
export function relativeTime(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '—';
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 0) return shortDate(d); // future — a date reads better than "-3m"
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days <= 14) return `${days}d ago`;
  return shortDate(d);
}

/** Day-level bucket label for grouping lists: Today / Yesterday / 12 Mar. */
export function dayLabel(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '—';
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';
  return shortDate(d);
}

/** ₹1,23,456 — Indian grouping, no decimals. Paise-safe via `fromPaise`. */
export function inr(amount: number | null | undefined, opts: { fromPaise?: boolean } = {}): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const rupees = opts.fromPaise ? amount / 100 : amount;
  try {
    return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  } catch {
    // Hermes without full-ICU — fall back to plain grouping.
    return `₹${Math.round(rupees)}`;
  }
}

/** snake_case / kebab-case → "Title Case". */
export function titleCase(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** First letters of the first two words, for avatar bubbles. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "1.2 MB" */
export function fileSize(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Clamp a 0..1 or 0..100 progress value to a whole percentage. */
export function pct(value: number | null | undefined, scale: 1 | 100 = 100): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const n = scale === 1 ? value * 100 : value;
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}
