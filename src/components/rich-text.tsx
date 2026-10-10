import { Fragment, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { AppText } from '@/components/ui';

/**
 * Light formatting a nutritionist writes on the web (meal notes, ingredients):
 *   **bold**, "- " or "• " bullet lines, "1. " numbered lines, blank line =
 *   new paragraph. Same rules as the web's RichText, so the client sees what
 *   the nutritionist previewed.
 */

type Block =
  | { kind: 'para'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[]; start: number };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  let cur: Block | null = null;
  const flush = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const b = BULLET.exec(line);
    const n = NUMBERED.exec(line);
    if (b) {
      if (cur?.kind !== 'ul') {
        flush();
        cur = { kind: 'ul', items: [] };
      }
      cur.items.push(b[1]);
    } else if (n) {
      if (cur?.kind !== 'ol') {
        flush();
        cur = { kind: 'ol', items: [], start: Number(n[1]) || 1 };
      }
      cur.items.push(n[2]);
    } else {
      if (cur?.kind !== 'para') {
        flush();
        cur = { kind: 'para', lines: [] };
      }
      cur.lines.push(line);
    }
  }
  flush();
  return blocks;
}

/** True when the text uses any formatting (lines, bullets, numbers or bold). */
export function hasRichFormatting(text: string): boolean {
  return /\n|\*\*.+?\*\*/.test(text) || BULLET.test(text) || NUMBERED.test(text);
}

/** **bold** inside a line, as nested Text. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      // Plain Text so it inherits the surrounding size and colour.
      <Text key={i++} style={{ fontWeight: '700' }}>
        {m[1]}
      </Text>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({
  text,
  variant = 'muted',
  tone = 'muted',
}: {
  text: string;
  variant?: 'muted' | 'caption' | 'body';
  tone?: 'muted' | 'faint' | 'text';
}) {
  return (
    <View style={{ gap: 6 }}>
      {parse(text).map((b, i) => {
        if (b.kind === 'para') {
          return (
            <AppText key={i} variant={variant} tone={tone}>
              {b.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 ? '\n' : null}
                  {inline(l)}
                </Fragment>
              ))}
            </AppText>
          );
        }
        return (
          <View key={i} style={{ gap: 3 }}>
            {b.items.map((it, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                <AppText variant={variant} tone="faint" style={{ minWidth: b.kind === 'ol' ? 16 : 8 }}>
                  {b.kind === 'ol' ? `${b.start + j}.` : '•'}
                </AppText>
                <AppText variant={variant} tone={tone} style={{ flex: 1 }}>
                  {inline(it)}
                </AppText>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
