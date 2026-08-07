import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

import { AIGlow, Glass } from '@/design-system';
import { StructuredBlock } from './StructuredBlock';
import type { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="flex justify-end"
      >
        <Glass className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed text-foreground">
          {message.text}
        </Glass>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
        <AIGlow intensity="soft" animated className="rounded-full">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.40)] to-[hsl(var(--brand-magenta)_/_0.30)]">
            <Sparkles className="h-3 w-3 text-foreground" />
          </span>
        </AIGlow>
        NUSI
        <span className="h-1 w-1 rounded-full bg-foreground/20" />
        <span className="text-foreground/75 dark:text-foreground/55">workspace AI</span>
      </div>

      {/* Lead-in text */}
      {message.text && (
        <p className="text-sm leading-relaxed text-foreground/85">{message.text}</p>
      )}

      {/* Structured blocks */}
      {message.blocks?.map((block, i) => (
        <StructuredBlock key={i} block={block} />
      ))}
    </motion.div>
  );
}
