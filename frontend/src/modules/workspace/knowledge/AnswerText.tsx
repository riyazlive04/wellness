import { Fragment, type ReactNode } from 'react';

/**
 * Renders an assistant answer.
 *
 * Answers are assembled server-side from two kinds of text: figures written as
 * plain sentences, and passages quoted verbatim from the indexed documents.
 * The documents are Markdown, so quoting them exactly means their syntax
 * arrives intact — before this, a nutritionist read "**No — they are
 * estimates**" with the asterisks showing.
 *
 * Stripping the markers would have been simpler, but the emphasis is load
 * bearing: the guide bolds the clause that matters most in a section, which is
 * usually the limitation. So the small subset the corpus actually uses is
 * rendered rather than removed.
 *
 * Everything is built as React nodes. No HTML is ever interpreted, so a
 * document cannot inject markup by being written a particular way.
 */

/** Split on **bold**, keeping the delimiters' contents. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={`${keyPrefix}-b${i++}`} className="font-semibold">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}

type Block =
  | { kind: 'rule' }
  | { kind: 'source'; label: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'para'; lines: string[] };

/**
 * Group lines into blocks.
 *
 * Deliberately small: this handles the shapes the answer builder and the
 * corpus actually produce — a citation label, bullet lists, horizontal rules
 * between passages, and paragraphs. Anything else falls through as a
 * paragraph, which is always safe.
 */
function parse(answer: string): Block[] {
  const blocks: Block[] = [];
  let list: string[] = [];
  let para: string[] = [];

  const flush = () => {
    if (list.length) { blocks.push({ kind: 'list', items: list }); list = []; }
    if (para.length) { blocks.push({ kind: 'para', lines: para }); para = []; }
  };

  for (const raw of answer.split('\n')) {
    const line = raw.trimEnd();

    if (/^\s*[—–-]{3,}\s*$/.test(line)) { flush(); blocks.push({ kind: 'rule' }); continue; }
    if (!line.trim()) { flush(); continue; }

    // "[1] Are Plate Vision numbers accurate?" — the passage's own label.
    const source = /^\[(\d+)\]\s+(.*)$/.exec(line);
    if (source) { flush(); blocks.push({ kind: 'source', label: `[${source[1]}] ${source[2]}` }); continue; }

    const bullet = /^\s*[•*-]\s+(.*)$/.exec(line);
    if (bullet) {
      if (para.length) { blocks.push({ kind: 'para', lines: para }); para = []; }
      list.push(bullet[1]);
      continue;
    }

    if (list.length) { blocks.push({ kind: 'list', items: list }); list = []; }
    para.push(line);
  }
  flush();
  return blocks;
}

export function AnswerText({ answer, compact = false }: { answer: string; compact?: boolean }) {
  const blocks = parse(answer);
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
      {blocks.map((b, i) => {
        if (b.kind === 'rule') {
          return <hr key={i} className="border-0 border-t border-foreground/10" />;
        }
        if (b.kind === 'source') {
          return (
            <div key={i} className="text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/45">
              {b.label}
            </div>
          );
        }
        if (b.kind === 'list') {
          return (
            <ul key={i} className="space-y-1">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-2">
                  <span aria-hidden="true" className="mt-[0.45em] h-1 w-1 flex-shrink-0 rounded-full bg-foreground/35" />
                  <span className="flex-1">{inline(item, `${i}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="leading-relaxed">
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(line, `${i}-${j}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
