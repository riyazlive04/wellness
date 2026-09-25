import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Shell for the sales-call tools in the super admin (/admin/sop). Ported
 * from the Sirah Digital admin (3D site), where the same machine runs its
 * website-sales SOPs.
 *
 * Both are the same machine: a schema-driven input rail on the left, and a set
 * of tabbed output panes on the right that re-render as you type. Each tool
 * supplies its own section schema, its own stack seed, and its own generator
 * functions; everything below is what they have in common.
 *
 * Generators return HTML strings rather than JSX because the output is prose
 * with inline emphasis, and because "copy the whole pane as text" is one
 * `innerText` read that way. Every value that comes from an input is escaped
 * through `esc()` / `v()` / `m()` before it reaches a string — nothing user-typed
 * is ever interpolated raw.
 */

/* ------------------------------------------------------------------ types */

export interface Field {
  id: string;
  label: string;
  /** Italic helper line under the label — the coaching note. */
  q?: string;
  kind?: 'text' | 'number' | 'textarea' | 'select';
  placeholder?: string;
  /** Counts toward the readiness meter. */
  req?: boolean;
  opts?: Array<[string, string]>;
}

export interface Section {
  /** Where in the 30 minutes this belongs. `na` renders it grey (prep, not live). */
  clock: string;
  na?: boolean;
  title: string;
  open?: boolean;
  hint?: string;
  /** Each inner array is one row in the grid. */
  groups?: Field[][];
  /** Renders the value-stack builder instead of fields. */
  stack?: boolean;
  stackHint?: string;
  stackTotalLabel?: string;
  /** Appends the tool's live readout (renderReadout) under the fields. */
  readout?: boolean;
}

export interface StackRow {
  name: string;
  does: string;
  val: string;
}

export type Fields = Record<string, string>;

export interface Tab {
  id: string;
  label: string;
  html: string;
}

/* -------------------------------------------------------------- utilities */

export function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}

/** An unfilled slot, rendered as a visible amber placeholder. */
export function gap(hint: string): string {
  return `<span class="gap">[${esc(hint)}]</span>`;
}

/** A value, or the gap marker if it hasn't been filled in yet. */
export function v(val: string | undefined, hint: string): string {
  return val && val.trim() ? esc(val) : gap(hint);
}

export function money(n: string | number | undefined, cur: string): string | null {
  if (n === '' || n === undefined || n === null) return null;
  const num = typeof n === 'number' ? n : parseFloat(n);
  if (isNaN(num)) return null;
  try {
    return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: cur || 'INR',
      maximumFractionDigits: 0,
    }).format(num);
  } catch {
    return String(num);
  }
}

/** Money, wrapped for tabular alignment — or the gap marker. */
export function m(val: string | undefined, cur: string, hint: string): string {
  const f = money(val, cur);
  return f ? `<span class="num">${esc(f)}</span>` : gap(hint);
}

export function stackSum(rows: StackRow[]): number {
  return rows.reduce((a, r) => {
    const n = parseFloat(r.val);
    return a + (isNaN(n) ? 0 : n);
  }, 0);
}

export const CURRENCIES: Array<[string, string]> = [
  ['INR', '₹ Rupees'],
  ['USD', '$ Dollars'],
  ['AED', 'AED Dirhams'],
  ['GBP', '£ Pounds'],
  ['EUR', '€ Euros'],
];

export function round(n: number, dp = 1): string {
  return n.toFixed(dp).replace(/\.0$/, '');
}

/* ------------------------------------------------------------------ state */

export function useToolState(storageKey: string, sections: Section[], seedStack: StackRow[]) {
  const [fields, setFields] = useState<Fields>({});
  const [rows, setRows] = useState<StackRow[]>(seedStack);
  const [loaded, setLoaded] = useState(false);

  // Restore on mount. localStorage can throw outright (private mode, blocked
  // site data), so every access is guarded and a failure just means a blank form.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const data = JSON.parse(raw) as { f?: Fields; s?: StackRow[] };
        if (data.f) setFields(data.f);
        if (data.s && data.s.length) setRows(data.s);
      }
    } catch {
      /* start empty */
    }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ f: fields, s: rows }));
    } catch {
      /* nothing to do — the form still works, it just won't persist */
    }
  }, [fields, rows, loaded, storageKey]);

  const setField = useCallback((id: string, value: string) => {
    setFields((prev) => ({ ...prev, [id]: value }));
  }, []);

  const setRow = useCallback((i: number, key: keyof StackRow, value: string) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { name: '', does: '', val: '' }]);
  }, []);

  const removeRow = useCallback((i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }, []);

  const reset = useCallback(() => {
    setFields({});
    setRows(seedStack);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [seedStack, storageKey]);

  const required = useMemo(
    () =>
      sections.flatMap((s) => (s.groups || []).flat().filter((f) => f.req).map((f) => f.id)),
    [sections],
  );

  const readiness = useMemo(() => {
    const done = required.filter((id) => (fields[id] || '').trim()).length;
    const stackOk = rows.some((r) => r.name.trim() && r.val.trim()) ? 1 : 0;
    return Math.round(((done + stackOk) / (required.length + 1)) * 100);
  }, [required, fields, rows]);

  return { fields, setField, rows, setRow, addRow, removeRow, reset, readiness, loaded };
}

/* ------------------------------------------------------------------- CSS */

/**
 * Everything is scoped under `.tool` so nothing here can collide with Tailwind
 * or the site's globals — and, just as importantly, so the site's globals can't
 * reach in and restyle the generated output.
 *
 * Dark-only, deliberately: a call tool is read for 45 minutes straight, and the
 * dark surface keeps the script legible without glare. Every colour is declared
 * explicitly rather than inherited from the admin theme.
 */
export function toolCss(accent: string, accentInk: string, accentSoft: string): string {
  return `
.tool{
  --ground:#0b0a1a; --panel:#141327; --panel-2:#1b1a30; --sunk:#0e0d1e;
  --ink:#eef0fa; --ink-2:#a8adc9; --ink-3:#767c9c;
  --line:#272741; --line-2:#3a3a5c;
  --accent:${accent}; --accent-ink:${accentInk}; --accent-soft:${accentSoft};
  --warn:#e0a05a; --warn-soft:#2c1f10;
  --good:#5cc39b; --good-soft:#0f2620;
  --gold:#e5bd6a; --gold-soft:#2a2113; --gold-line:#4d3d1c;
  --shadow:0 1px 2px rgba(0,0,0,.5),0 12px 32px rgba(0,0,0,.35);
  color:var(--ink);
  font-family:"Plus Jakarta Sans",system-ui,sans-serif;
  font-size:15px;line-height:1.55;
}
.tool *{box-sizing:border-box}
.tool h1,.tool h2,.tool h3,.tool h4{margin:0;text-wrap:balance;font-weight:700}
.tool button,.tool input,.tool textarea,.tool select{font:inherit;color:inherit}
.tool p{margin:0}

.tool .top{position:sticky;top:0;z-index:30;background:var(--panel);border-bottom:1px solid var(--line)}
.tool .top-in{max-width:1580px;margin:0 auto;padding:13px 20px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.tool .brand{display:flex;flex-direction:column;gap:2px;margin-right:auto}
.tool .brand h1{font-size:19px;letter-spacing:-.4px;line-height:1.1}
.tool .eyebrow{font-size:10px;letter-spacing:2.2px;text-transform:uppercase;color:var(--accent);font-weight:700}
.tool .meter{display:flex;align-items:center;gap:10px;min-width:230px}
.tool .bar{flex:1;height:7px;border-radius:99px;background:var(--sunk);overflow:hidden;border:1px solid var(--line)}
.tool .bar i{display:block;height:100%;background:var(--accent);transition:width .25s ease}
.tool .pill{font-size:11px;font-weight:700;letter-spacing:.5px;padding:4px 10px;border-radius:99px;
  white-space:nowrap;text-transform:uppercase;background:var(--warn-soft);color:var(--warn);border:1px solid currentColor}
.tool .pill.ready{background:var(--good-soft);color:var(--good)}
.tool .acts{display:flex;gap:8px;flex-wrap:wrap}
.tool .btn{border:1px solid var(--line-2);background:var(--panel-2);border-radius:8px;padding:8px 13px;
  font-size:13px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s}
.tool .btn:hover{background:var(--sunk);border-color:var(--ink-3)}
.tool .btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.tool .btn.primary:hover{filter:brightness(1.08)}
.tool .btn:focus-visible,.tool input:focus-visible,.tool textarea:focus-visible,
.tool select:focus-visible,.tool .tab:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.tool a.back{font-size:12.5px;color:var(--ink-3);text-decoration:none;border-bottom:1px solid transparent}
.tool a.back:hover{color:var(--ink);border-bottom-color:var(--ink-3)}

.tool .wrap{max-width:1580px;margin:0 auto;padding:20px;display:grid;
  grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:20px;align-items:start}
@media(max-width:1100px){.tool .wrap{grid-template-columns:1fr}}

.tool .rail{display:flex;flex-direction:column;gap:12px;min-width:0}
.tool .sec{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow)}
.tool .sec>summary{list-style:none;cursor:pointer;padding:13px 16px;display:flex;align-items:center;gap:12px;user-select:none}
.tool .sec>summary::-webkit-details-marker{display:none}
.tool .sec>summary:hover{background:var(--panel-2)}
.tool .clock{font-size:11px;font-weight:700;background:var(--accent);color:var(--accent-ink);
  padding:3px 7px;border-radius:5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.tool .clock.na{background:var(--sunk);color:var(--ink-3);border:1px solid var(--line)}
.tool .sec summary h3{font-size:14.5px;letter-spacing:-.2px;flex:1}
.tool .cnt{font-size:11px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.tool .cnt.full{color:var(--good)}
.tool .chev{color:var(--ink-3);transition:transform .2s}
.tool .sec[open] .chev{transform:rotate(90deg)}
.tool .sbody{padding:4px 16px 17px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:13px}
.tool .hint{font-size:12.5px;color:var(--ink-2);margin:9px 0 0;font-style:italic}

.tool .f{display:flex;flex-direction:column;gap:5px;min-width:0}
.tool .f label{font-size:12px;font-weight:700;color:var(--ink-2);letter-spacing:.2px}
.tool .f .q{font-size:12px;color:var(--ink-3);font-style:italic;margin-top:-2px}
.tool .f input,.tool .f textarea,.tool .f select{width:100%;background:var(--sunk);border:1px solid var(--line);
  border-radius:8px;padding:9px 11px;font-size:14px;transition:border-color .15s,background .15s;color:var(--ink)}
.tool .f input::placeholder,.tool .f textarea::placeholder{color:var(--ink-3)}
.tool .f input:hover,.tool .f textarea:hover{border-color:var(--line-2)}
.tool .f input:focus,.tool .f textarea:focus{background:var(--panel);border-color:var(--accent)}
.tool .f textarea{resize:vertical;min-height:62px;line-height:1.5}
.tool .f input[type=number]{font-variant-numeric:tabular-nums}
.tool .grp{display:grid;gap:11px}
@media(max-width:600px){.tool .grp{grid-template-columns:1fr!important}}

.tool .stack-row{display:grid;grid-template-columns:1.1fr 1.4fr 108px 32px;gap:8px;align-items:start}
@media(max-width:720px){.tool .stack-row{grid-template-columns:1fr 1fr}.tool .kill{grid-column:2;justify-self:end}}
.tool .kill{border:1px solid var(--line);background:var(--panel-2);border-radius:6px;height:36px;width:32px;
  cursor:pointer;color:var(--ink-3);font-size:16px;line-height:1;display:grid;place-items:center}
.tool .kill:hover{color:var(--accent);border-color:var(--accent)}
.tool .total{display:flex;justify-content:space-between;align-items:baseline;padding:11px 13px;
  background:var(--gold-soft);border:1px solid var(--gold-line);border-radius:9px}
.tool .total b{font-size:18px;color:var(--gold);font-variant-numeric:tabular-nums}
.tool .total span{font-size:11.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--ink-2)}

.tool .out{position:sticky;top:74px;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;box-shadow:var(--shadow);overflow:hidden;min-width:0}
@media(max-width:1100px){.tool .out{position:static}}
.tool .tabs{display:flex;gap:2px;padding:9px 10px 0;background:var(--panel-2);border-bottom:1px solid var(--line);overflow-x:auto}
.tool .tab{border:none;background:transparent;padding:9px 14px;border-radius:8px 8px 0 0;cursor:pointer;
  font-size:13px;font-weight:600;color:var(--ink-2);white-space:nowrap;border-bottom:2px solid transparent}
.tool .tab:hover{color:var(--ink)}
.tool .tab[aria-selected=true]{background:var(--panel);color:var(--accent);border-bottom-color:var(--accent)}
.tool .pane{padding:20px 22px 26px;max-height:calc(100vh - 150px);overflow-y:auto}
@media(max-width:1100px){.tool .pane{max-height:none}}

.tool .beat{border-left:2px solid var(--line);padding:0 0 20px 15px;margin-left:5px}
.tool .beat:last-child{padding-bottom:4px}
.tool .beat-h{display:flex;align-items:center;gap:9px;margin-bottom:7px;flex-wrap:wrap}
.tool .beat-h b{font-size:15px;letter-spacing:-.2px}
.tool .stage{font-size:11.5px;font-weight:700;color:var(--accent);text-transform:uppercase;
  letter-spacing:.9px;font-variant-numeric:tabular-nums}
.tool .say{background:var(--panel-2);border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:0 9px 9px 0;padding:12px 15px;font-size:14.5px;line-height:1.64}
.tool .say p{margin:0 0 9px}
.tool .say p:last-child{margin:0}
.tool .do{font-size:13px;color:var(--ink-2);margin:8px 0 0}
.tool .do b{color:var(--ink)}
.tool .gap{background:var(--warn-soft);color:var(--warn);border-bottom:1.5px dashed currentColor;
  padding:0 3px;border-radius:3px;font-weight:700}
.tool .num{font-weight:700;font-variant-numeric:tabular-nums}
.tool .callout{font-size:12.5px;font-weight:700;color:var(--accent);background:var(--accent-soft);
  border:1px dashed var(--accent);border-radius:8px;padding:9px 13px;margin-top:9px;text-align:center}
.tool .callout.gold{color:var(--gold);background:var(--gold-soft);border-color:var(--gold-line)}
.tool .callout.left{text-align:left}

.tool .ocard{border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:11px;background:var(--panel-2)}
.tool .ocard h4{font-size:13.5px;padding:10px 14px;background:var(--sunk);border-bottom:1px solid var(--line);
  display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.tool .ocard .say{border-radius:0;border:none;border-left:3px solid var(--accent);background:var(--panel)}
.tool .btype{font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;
  background:var(--accent-soft);color:var(--accent);padding:3px 7px;border-radius:4px}

.tool .prop{background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:24px 26px}
.tool .prop h2{font-size:24px;letter-spacing:-.6px;line-height:1.15;margin-bottom:5px}
.tool .prop .for{font-size:11.5px;letter-spacing:1.3px;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:20px}
.tool .prop h3{font-size:11.5px;letter-spacing:1.6px;text-transform:uppercase;color:var(--ink-3);margin:24px 0 8px}
.tool .prop p{margin:0 0 10px;font-size:14.5px}
.tool .prop .lede{font-size:16px;line-height:1.55}
.tool .tblwrap{overflow-x:auto;margin:8px 0 4px}
.tool table{width:100%;border-collapse:collapse;font-size:13.5px}
.tool th{text-align:left;padding:8px 11px;background:var(--sunk);font-size:10.5px;letter-spacing:1.1px;
  text-transform:uppercase;color:var(--ink-2);border-bottom:1px solid var(--line-2);font-weight:700}
.tool td{padding:9px 11px;border-bottom:1px solid var(--line);vertical-align:top}
.tool td.n,.tool th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tool tfoot td{font-weight:700;border-bottom:none;border-top:2px solid var(--gold-line);
  background:var(--gold-soft);color:var(--gold)}
.tool .invest{display:flex;flex-wrap:wrap;gap:13px;margin-top:10px}
.tool .invest .box{flex:1;min-width:165px;border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:var(--panel)}
.tool .invest .box.hero{border-color:var(--accent);background:var(--accent-soft)}
.tool .invest .box.value{border-color:var(--gold-line);background:var(--gold-soft)}
.tool .invest .box span{display:block;font-size:10.5px;letter-spacing:1.3px;text-transform:uppercase;
  color:var(--ink-2);font-weight:700;margin-bottom:5px}
.tool .invest .box b{font-size:22px;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.tool .invest .box.hero b{color:var(--accent)}
.tool .invest .box.value b{color:var(--gold)}
.tool .invest .box em{display:block;font-size:12px;color:var(--ink-2);font-style:normal;margin-top:3px}
.tool .sig{margin-top:24px;padding-top:16px;border-top:1px solid var(--line);font-size:13px;color:var(--ink-2)}
.tool .empty{color:var(--ink-3);font-size:13.5px;font-style:italic}

.tool .day{display:flex;gap:13px;padding:13px 0;border-bottom:1px solid var(--line)}
.tool .day:last-child{border-bottom:none}
.tool .day .d{flex:0 0 74px;font-size:11px;font-weight:700;background:var(--accent);color:var(--accent-ink);
  border-radius:5px;padding:4px 6px;text-align:center;height:fit-content}
.tool .day .c{flex:1;min-width:0}
.tool .day .c b{display:block;font-size:14.5px;margin-bottom:4px}

.tool .toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,14px);opacity:0;pointer-events:none;
  background:var(--ink);color:var(--ground);padding:10px 18px;border-radius:9px;font-size:13.5px;
  font-weight:700;transition:opacity .2s,transform .2s;z-index:60;box-shadow:var(--shadow)}
.tool .toast.show{opacity:1;transform:translate(-50%,0)}
@media (prefers-reduced-motion:reduce){.tool *{transition:none!important}}
`;
}

/* ------------------------------------------------------------------ shell */

interface ShellProps {
  eyebrow: string;
  title: string;
  css: string;
  sections: Section[];
  tabs: Tab[];
  /** Tab ids the two copy buttons read from. */
  copyScriptTab: string;
  copyProposalTab: string;
  state: ReturnType<typeof useToolState>;
  /** Live calculation shown under sections flagged `readout`. */
  renderReadout?: (fields: Fields, cur: string) => ReactNode;
  backHref?: string;
  backLabel?: string;
}

export function ToolShell({
  eyebrow,
  title,
  css,
  sections,
  tabs,
  copyScriptTab,
  copyProposalTab,
  state,
  renderReadout,
  backHref = '/admin',
  backLabel = '← Admin',
}: ShellProps) {
  const { fields, setField, rows, setRow, addRow, removeRow, reset, readiness } = state;
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const [toast, setToast] = useState('');
  const cur = fields.cur || 'INR';

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 1900);
    return () => clearTimeout(t);
  }, [toast]);

  const copy = useCallback(
    async (tabId: string, label: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      // Read the text from a freshly-rendered offscreen copy rather than from
      // the live pane. `innerText` only reproduces block structure as line
      // breaks for elements that are actually rendered — on the hidden pane of
      // an inactive tab it degrades to one run-on blob. Offscreen-but-rendered
      // gives correctly formatted text no matter which tab is showing.
      const scratch = document.createElement('div');
      scratch.className = 'tool';
      scratch.style.cssText = 'position:fixed;left:-99999px;top:0;width:700px';
      scratch.innerHTML = tab.html;
      document.body.appendChild(scratch);
      const text = scratch.innerText.replace(/\n{3,}/g, '\n\n').trim();
      document.body.removeChild(scratch);

      if (!text) {
        setToast('Nothing to copy yet');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        setToast(`${label} copied`);
      } catch {
        // Clipboard API needs a secure context; fall back to a hidden textarea.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          setToast(`${label} copied`);
        } catch {
          setToast('Press Ctrl+C to copy');
        }
        document.body.removeChild(ta);
      }
    },
    [tabs],
  );

  const total = stackSum(rows);

  return (
    <div className="tool">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <header className="top">
        <div className="top-in">
          <div className="brand">
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
          </div>
          <div className="meter">
            <div className="bar">
              <i style={{ width: `${readiness}%` }} />
            </div>
            <span className={readiness === 100 ? 'pill ready' : 'pill'}>
              {readiness === 100 ? 'Ready to close' : `${readiness}% ready`}
            </span>
          </div>
          <div className="acts">
            <a className="back" href={backHref}>
              {backLabel}
            </a>
            <button className="btn" onClick={() => copy(copyScriptTab, 'Script')}>
              Copy script
            </button>
            <button className="btn primary" onClick={() => copy(copyProposalTab, 'Proposal')}>
              Copy proposal
            </button>
            <button
              className="btn"
              onClick={() => {
                if (confirm('Clear every answer on this page? This cannot be undone.')) {
                  reset();
                  setToast('Cleared');
                }
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      <div className="wrap">
        {/* -------------------------------------------------- input rail */}
        <div className="rail">
          {sections.map((sec) => {
            const secFields = (sec.groups || []).flat();
            const req = secFields.filter((f) => f.req);
            const done = req.filter((f) => (fields[f.id] || '').trim()).length;
            const stackLines = rows.filter((r) => r.name.trim() && r.val.trim()).length;

            return (
              <details className="sec" key={sec.title} open={sec.open}>
                <summary>
                  <span className={sec.na ? 'clock na' : 'clock'}>{sec.clock}</span>
                  <h3>{sec.title}</h3>
                  <span className={req.length && done === req.length ? 'cnt full' : 'cnt'}>
                    {sec.stack
                      ? stackLines
                        ? `${stackLines} lines`
                        : 'empty'
                      : `${done}/${req.length}`}
                  </span>
                  <span className="chev">›</span>
                </summary>
                <div className="sbody">
                  {sec.hint && <p className="hint">{sec.hint}</p>}

                  {(sec.groups || []).map((group, gi) => (
                    <div
                      className="grp"
                      key={gi}
                      style={{ gridTemplateColumns: `repeat(${group.length}, minmax(0,1fr))` }}
                    >
                      {group.map((f) => (
                        <div className="f" key={f.id}>
                          <label htmlFor={f.id}>{f.label}</label>
                          {f.q && <p className="q">{f.q}</p>}
                          {f.kind === 'textarea' ? (
                            <textarea
                              id={f.id}
                              value={fields[f.id] || ''}
                              placeholder={f.placeholder}
                              onChange={(e) => setField(f.id, e.target.value)}
                            />
                          ) : f.kind === 'select' ? (
                            <select
                              id={f.id}
                              value={fields[f.id] || (f.opts ? f.opts[0][0] : '')}
                              onChange={(e) => setField(f.id, e.target.value)}
                            >
                              {(f.opts || []).map(([val, lbl]) => (
                                <option key={val} value={val}>
                                  {lbl}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              id={f.id}
                              type={f.kind === 'number' ? 'number' : 'text'}
                              min={f.kind === 'number' ? 0 : undefined}
                              value={fields[f.id] || ''}
                              placeholder={f.placeholder}
                              onChange={(e) => setField(f.id, e.target.value)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ))}

                  {sec.stack && (
                    <>
                      {sec.stackHint && <p className="hint">{sec.stackHint}</p>}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {rows.map((r, i) => (
                          <div className="stack-row" key={i}>
                            <input
                              aria-label="What it is"
                              placeholder="What it is"
                              value={r.name}
                              onChange={(e) => setRow(i, 'name', e.target.value)}
                            />
                            <input
                              aria-label="What it does for them"
                              placeholder="…so that you ___"
                              value={r.does}
                              onChange={(e) => setRow(i, 'does', e.target.value)}
                            />
                            <input
                              aria-label="Standalone value"
                              type="number"
                              min={0}
                              placeholder="Value"
                              value={r.val}
                              onChange={(e) => setRow(i, 'val', e.target.value)}
                            />
                            <button
                              type="button"
                              className="kill"
                              aria-label={`Remove line ${i + 1}`}
                              onClick={() => removeRow(i)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={addRow}>
                        + Add line
                      </button>
                      <div className="total">
                        <span>{sec.stackTotalLabel || 'Total standalone value'}</span>
                        <b>{total > 0 ? money(total, cur) : '—'}</b>
                      </div>
                    </>
                  )}

                  {sec.readout && renderReadout?.(fields, cur)}
                </div>
              </details>
            );
          })}
        </div>

        {/* ------------------------------------------------ output panes */}
        <section className="out">
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                className="tab"
                role="tab"
                aria-selected={active === t.id}
                onClick={() => setActive(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tabs.map((t) => (
            <div
              key={t.id}
              className="pane"
              role="tabpanel"
              hidden={active !== t.id}
              dangerouslySetInnerHTML={{ __html: t.html }}
            />
          ))}
        </section>
      </div>

      <div className={toast ? 'toast show' : 'toast'}>{toast}</div>
    </div>
  );
}
