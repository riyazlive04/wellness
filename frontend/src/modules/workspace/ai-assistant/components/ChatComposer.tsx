import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';

import { AIGlow, Glass } from '@/design-system';

interface ChatComposerProps {
  onSend: (text: string) => void;
  /** Optional follow-up suggestions to show above the input */
  suggestions?: string[];
  disabled?: boolean;
  placeholder?: string;
}

export function ChatComposer({ onSend, suggestions = [], disabled, placeholder }: ChatComposerProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 160)}px`;
  }, [text]);

  function send() {
    const v = text.trim();
    if (!v || disabled) return;
    onSend(v);
    setText('');
  }

  return (
    <div className="space-y-3">
      {/* Suggestions row */}
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            className="flex flex-wrap items-center gap-1.5"
          >
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-violet-300">
              <Sparkles className="h-3 w-3" />
              Follow-ups
            </span>
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSend(s)}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-400/[0.06] px-3 py-1.5 text-[12px] leading-snug text-foreground/85 transition-all hover:border-violet-400/50 hover:bg-violet-400/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="text-violet-300/80">›</span>
                <span className="line-clamp-1">{s}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <AIGlow intensity="soft" animated={false} className="rounded-2xl">
        <Glass variant="heavy" className="rounded-2xl">
          <div className="flex items-end gap-2 p-2.5">
            <textarea
              ref={ref}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={placeholder ?? 'Ask SIRAH anything about your workspace…'}
              rows={1}
              disabled={disabled}
              className="block flex-1 resize-none bg-transparent px-2.5 py-2 text-sm leading-relaxed text-foreground placeholder:text-foreground/35 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={send}
              disabled={!text.trim() || disabled}
              className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 text-foreground transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </Glass>
      </AIGlow>

      <div className="px-1 text-[10px] text-foreground/35">
        SIRAH AI reads your workspace data (clients, programs, messages) to ground its answers.
        Sensitive info stays inside your workspace.
      </div>
    </div>
  );
}
