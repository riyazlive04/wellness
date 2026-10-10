import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Light formatting for notes a nutritionist writes (meal notes, ingredients):
 *   **bold**, "- " or "• " bullet lines, "1. " numbered lines, blank line =
 *   new paragraph. Stored as plain text, so it stays readable anywhere that
 *   can't render it (old app versions, exports).
 *
 * Built as React nodes only: no HTML is interpreted, so nothing a user types
 * can inject markup.
 */

type Block =
  | { kind: 'para'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[]; start: number };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

export function parseRichText(text: string): Block[] {
  const blocks: Block[] = [];
  let cur: Block | null = null;
  const flush = () => { if (cur) blocks.push(cur); cur = null; };

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const b = BULLET.exec(line);
    const n = NUMBERED.exec(line);
    if (b) {
      if (cur?.kind !== 'ul') { flush(); cur = { kind: 'ul', items: [] }; }
      cur.items.push(b[1]);
    } else if (n) {
      if (cur?.kind !== 'ol') { flush(); cur = { kind: 'ol', items: [], start: Number(n[1]) || 1 }; }
      cur.items.push(n[2]);
    } else {
      if (cur?.kind !== 'para') { flush(); cur = { kind: 'para', lines: [] }; }
      cur.lines.push(line);
    }
  }
  flush();
  return blocks;
}

/** **bold** inside a line. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={`${key}-${i++}`} className="font-semibold text-foreground">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** True when the text uses any formatting (lines, bullets, numbers or bold). */
export function hasRichFormatting(text: string): boolean {
  return /\n|\*\*.+?\*\*/.test(text) || BULLET.test(text) || NUMBERED.test(text);
}

/** Plain-text version for exports: bullets become "•", bold markers drop. */
export function richToPlain(text: string): string {
  return parseRichText(text)
    .map((b) =>
      b.kind === 'para'
        ? b.lines.join('\n')
        : b.kind === 'ul'
          ? b.items.map((it) => `• ${it}`).join('\n')
          : b.items.map((it, i) => `${b.start + i}. ${it}`).join('\n'))
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1');
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseRichText(text);
  return (
    <div className={cn('space-y-1.5', className)}>
      {blocks.map((b, i) => {
        if (b.kind === 'ul') {
          return (
            <ul key={i} className="space-y-0.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  <span aria-hidden className="mt-[0.55em] h-1 w-1 flex-shrink-0 rounded-full bg-current opacity-50" />
                  <span className="min-w-0 flex-1">{inline(it, `${i}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.kind === 'ol') {
          return (
            <ol key={i} className="space-y-0.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  <span className="flex-shrink-0 tabular-nums opacity-60">{b.start + j}.</span>
                  <span className="min-w-0 flex-1">{inline(it, `${i}-${j}`)}</span>
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l, `${i}-${j}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
