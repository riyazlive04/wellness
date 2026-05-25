import type { ReportStatus, ReportTemplate, Cadence } from './types';

export const ACCENT_STYLES: Record<
  ReportTemplate['accent'],
  { header: string; chip: string; ring: string; icon: string }
> = {
  sage:    { header: 'from-emerald-400/30 to-transparent', chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200', ring: 'shadow-[0_0_18px_-6px_rgba(125,190,157,0.4)]', icon: 'text-emerald-300' },
  indigo:  { header: 'from-violet-400/30 to-transparent',   chip: 'border-violet-400/40 bg-violet-400/10 text-violet-200',  ring: 'shadow-[0_0_18px_-6px_rgba(128,135,255,0.4)]', icon: 'text-violet-300' },
  sand:    { header: 'from-amber-300/30 to-transparent',    chip: 'border-amber-300/40 bg-amber-300/10 text-amber-200',     ring: 'shadow-[0_0_18px_-6px_rgba(229,197,140,0.4)]', icon: 'text-amber-300' },
  coral:   { header: 'from-rose-400/30 to-transparent',     chip: 'border-rose-400/40 bg-rose-400/10 text-rose-200',         ring: 'shadow-[0_0_18px_-6px_rgba(248,113,113,0.4)]', icon: 'text-rose-300' },
};

export const STATUS_META: Record<
  ReportStatus,
  { label: string; chip: string; dot: string }
> = {
  ready:      { label: 'Ready',       chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200', dot: 'bg-emerald-400' },
  generating: { label: 'Generating',  chip: 'border-violet-400/40 bg-violet-400/10 text-violet-200',    dot: 'bg-violet-400' },
  queued:     { label: 'Queued',      chip: 'border-amber-300/40 bg-amber-300/10 text-amber-200',       dot: 'bg-amber-300' },
  failed:     { label: 'Failed',      chip: 'border-rose-400/40 bg-rose-400/10 text-rose-200',          dot: 'bg-rose-400' },
};

export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(Math.abs(ms) / 1000);
  const future = ms < 0;
  let s = '';
  if (sec < 60) s = 'a moment';
  else {
    const min = Math.floor(sec / 60);
    if (min < 60) s = `${min}m`;
    else {
      const hr = Math.floor(min / 60);
      if (hr < 24) s = `${hr}h`;
      else {
        const d = Math.floor(hr / 24);
        if (d < 30) s = `${d}d`;
        else s = new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      }
    }
  }
  return future ? `in ${s}` : `${s} ago`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function cadenceLabel(c: Cadence, dayOf: number, hourOf: number): string {
  if (c === 'weekly') return `Every ${DAYS[dayOf]} at ${String(hourOf).padStart(2, '0')}:00`;
  if (c === 'monthly') return `Every month on day ${dayOf} at ${String(hourOf).padStart(2, '0')}:00`;
  return 'One-off';
}

export function fmtSize(kb?: number): string {
  if (!kb) return '—';
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
