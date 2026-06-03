import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, Paperclip, Sparkles, X, FileText } from 'lucide-react';

import { Glass } from '@/design-system';
import { MESSAGE_TEMPLATES } from '../data/templates';
import { cn } from '@/lib/utils';

interface ComposerProps {
  /** AI-suggested replies for the current conversation context */
  suggestions?: string[];
  /** Called when the owner sends a message */
  onSend: (text: string) => void;
  /** Variables available for template substitution (e.g. { name, program }) */
  templateVars: Record<string, string>;
  placeholder?: string;
}

export function Composer({ suggestions = [], onSend, templateVars, placeholder }: ComposerProps) {
  const [text, setText] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
  }, [text]);

  function handleSend() {
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText('');
  }

  function fillTemplate(body: string): string {
    return body.replace(/\{(\w+)\}/g, (_, key: string) => templateVars[key] ?? `{${key}}`);
  }

  function pickTemplate(body: string) {
    setText(fillTemplate(body));
    setTemplatesOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <div className="border-t border-foreground/[0.06] bg-canvas/85 backdrop-blur-xl">
      {/* AI suggestions row */}
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            className="border-b border-foreground/[0.04] px-4 py-2.5"
          >
            <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
              <Sparkles className="h-3 w-3" />
              SIRAH suggestions
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setText(s)}
                  className="group inline-flex max-w-md items-start gap-1.5 rounded-lg border border-violet-400/25 bg-violet-400/[0.06] px-3 py-1.5 text-left text-[12px] leading-snug text-foreground/85 transition-all hover:border-violet-400/50 hover:bg-violet-400/[0.1]"
                >
                  <span className="text-violet-700 dark:text-violet-300/80 group-hover:text-violet-700 dark:text-violet-200">›</span>
                  <span className="line-clamp-2">{s}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Templates popover */}
      <AnimatePresence>
        {templatesOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            className="border-b border-foreground/[0.04] px-4 py-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                Templates
              </div>
              <button
                type="button"
                onClick={() => setTemplatesOpen(false)}
                className="text-foreground/75 dark:text-foreground/55 hover:text-foreground"
                aria-label="Close templates"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {MESSAGE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTemplate(t.body)}
                    className="group rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] p-2.5 text-left transition-colors hover:border-foreground/15 hover:bg-foreground/[0.05]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                        {t.category.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-medium text-foreground">{t.title}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-foreground/75 dark:text-foreground/55">
                      {fillTemplate(t.body)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer row */}
      <div className="flex items-end gap-2 p-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTemplatesOpen((o) => !o)}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground',
              templatesOpen && 'bg-foreground/[0.05] text-foreground',
            )}
            aria-label="Templates"
          >
            <FileText className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label="Attach"
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </div>

        <Glass className="flex-1 rounded-2xl">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={placeholder ?? 'Message…'}
            rows={1}
            className="block w-full resize-none bg-transparent px-3.5 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-foreground/35 focus:outline-none"
          />
        </Glass>

        {text.trim() ? (
          <button
            type="button"
            onClick={handleSend}
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 text-foreground transition-transform hover:scale-105"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-foreground/[0.05] text-foreground/70 transition-colors hover:bg-foreground/[0.1] hover:text-foreground"
            aria-label="Voice note"
          >
            <Mic className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
