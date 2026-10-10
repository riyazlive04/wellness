import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Bold, Eye, List, ListOrdered, PencilLine } from 'lucide-react';

import { cn } from '@/lib/utils';
import { RichText } from './RichText';

/**
 * A notes box with light formatting: bold, bullet and numbered lists, line
 * breaks. Writes plain text with markers (**bold**, "- ", "1. ") that
 * RichText renders, so the client sees it formatted and old app versions
 * still see readable text.
 *
 * Enter continues a list; Enter on an empty list item ends it. Ctrl/Cmd+B
 * toggles bold.
 */
export function FormattedTextarea({
  value,
  onChange,
  placeholder,
  maxLength = 2000,
  minRows = 3,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  minRows?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const rows = Math.min(14, Math.max(minRows, value.split('\n').length + 1));

  // Where the cursor goes once React has rendered the edited value.
  const pendingSel = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !pendingSel.current) return;
    el.focus();
    el.setSelectionRange(...pendingSel.current);
    pendingSel.current = null;
  }, [value]);

  /** Set the new text and put the cursor/selection where it belongs. */
  const commit = (next: string, selStart: number, selEnd = selStart) => {
    next = next.slice(0, maxLength);
    if (next === value) {
      // No re-render will come, so place the cursor now.
      ref.current?.setSelectionRange(selStart, selEnd);
      return;
    }
    pendingSel.current = [selStart, selEnd];
    onChange(next);
  };

  const toggleBold = () => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e);
    if (sel.startsWith('**') && sel.endsWith('**') && sel.length >= 4) {
      const inner = sel.slice(2, -2);
      commit(value.slice(0, s) + inner + value.slice(e), s, s + inner.length);
    } else if (value.slice(s - 2, s) === '**' && value.slice(e, e + 2) === '**') {
      commit(value.slice(0, s - 2) + sel + value.slice(e + 2), s - 2, e - 2);
    } else {
      const text = sel || 'bold text';
      commit(`${value.slice(0, s)}**${text}**${value.slice(e)}`, s + 2, s + 2 + text.length);
    }
  };

  /** Turn the selected lines (or the current line) into a list, or back. */
  const toggleList = (kind: 'ul' | 'ol') => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const nl = value.indexOf('\n', e);
    const lineEnd = nl === -1 ? value.length : nl;
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const isUl = (l: string) => /^\s*[-*•]\s+/.test(l);
    const isOl = (l: string) => /^\s*\d+[.)]\s+/.test(l);
    const already = lines.some((l) => l.trim())
      && lines.every((l) => !l.trim() || (kind === 'ul' ? isUl(l) : isOl(l)));
    let n = 0;
    const next = lines.map((l) => {
      const bare = l.replace(/^\s*([-*•]|\d+[.)])\s+/, '');
      if (already) return bare;
      if (!l.trim() && lines.length > 1) return l;
      n += 1;
      return kind === 'ul' ? `- ${bare}` : `${n}. ${bare}`;
    }).join('\n');
    const blockEnd = lineStart + next.length;
    // A plain cursor stays a cursor (at the end), so typing doesn't replace the new marker.
    commit(value.slice(0, lineStart) + next + value.slice(lineEnd), s === e ? blockEnd : lineStart, blockEnd);
  };

  const onKeyDown = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'b') {
      ev.preventDefault();
      toggleBold();
      return;
    }
    if (ev.key !== 'Enter' || ev.shiftKey) return;
    const el = ev.currentTarget;
    const s = el.selectionStart;
    if (s !== el.selectionEnd) return;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const line = value.slice(lineStart, s);
    const ul = /^(\s*)([-*•])\s+(.*)$/.exec(line);
    const ol = /^(\s*)(\d+)([.)])\s+(.*)$/.exec(line);
    if (!ul && !ol) return;
    ev.preventDefault();
    const itemText = ul ? ul[3] : ol![4];
    if (!itemText.trim()) {
      // Enter on an empty item ends the list.
      commit(value.slice(0, lineStart) + value.slice(s), lineStart);
      return;
    }
    const marker = ul ? `${ul[1]}${ul[2]} ` : `${ol![1]}${Number(ol![2]) + 1}${ol![3]} `;
    const insert = `\n${marker}`;
    commit(value.slice(0, s) + insert + value.slice(s), s + insert.length);
  };

  // Pressing a toolbar button must not pull focus (and the selection) out of the textarea.
  const keepFocus = (ev: MouseEvent) => ev.preventDefault();
  const btn = 'grid h-7 w-7 place-items-center rounded-md text-foreground/65 transition-colors hover:bg-foreground/[0.07] hover:text-foreground disabled:opacity-40';

  return (
    <div className={cn('overflow-hidden rounded-xl border border-foreground/10 bg-foreground/[0.03] focus-within:border-teal-400/60', className)}>
      <div className="flex items-center gap-0.5 border-b border-foreground/[0.07] px-1.5 py-1">
        <button type="button" onClick={toggleBold} onMouseDown={keepFocus} disabled={preview} className={btn} title="Bold (Ctrl+B)" aria-label="Bold">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => toggleList('ul')} onMouseDown={keepFocus} disabled={preview} className={btn} title="Bullet list" aria-label="Bullet list">
          <List className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => toggleList('ol')} onMouseDown={keepFocus} disabled={preview} className={btn} title="Numbered list" aria-label="Numbered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          {value.length > maxLength * 0.8 && (
            <span className="px-1 text-[10px] tabular-nums text-foreground/45">{value.length}/{maxLength}</span>
          )}
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-foreground/65 hover:bg-foreground/[0.07] hover:text-foreground"
          >
            {preview ? <><PencilLine className="h-3 w-3" /> Edit</> : <><Eye className="h-3 w-3" /> Preview</>}
          </button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-[76px] px-3 py-2 text-sm text-foreground/80">
          {value.trim() ? <RichText text={value} /> : <span className="text-foreground/40">Nothing to preview yet.</span>}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={rows}
          className="block w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-foreground/35"
        />
      )}
    </div>
  );
}
