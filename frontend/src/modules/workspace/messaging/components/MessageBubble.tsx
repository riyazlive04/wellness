import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCheck, Play, Pause } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Message } from '../types';
import { clockOf, durationLabel } from '../helpers';

interface MessageBubbleProps {
  message: Message;
}

/**
 * MessageBubble — renders one message in the WhatsApp-style chat.
 * Owner messages: right-aligned gradient. Client messages: left-aligned glass.
 * System messages: centered subtle separator.
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.kind === 'system') {
    return (
      <div className="my-3 flex justify-center">
        <span className="rounded-full bg-foreground/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
          {message.body}
        </span>
      </div>
    );
  }

  const isOwner = message.author === 'owner';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn('flex w-full', isOwner ? 'justify-end' : 'justify-start')}
    >
      <div className="max-w-[80%] md:max-w-[70%]">
        <div
          className={cn(
            'inline-block overflow-hidden rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isOwner
              ? 'rounded-br-md bg-gradient-to-br from-blue-600/85 to-fuchsia-500/80 text-foreground shadow-[0_4px_18px_-4px_rgba(99,102,241,0.55)]'
              : 'rounded-bl-md border border-foreground/[0.06] bg-foreground/[0.04] text-foreground/90 backdrop-blur-md',
          )}
        >
          {message.kind === 'photo' && message.imageUrl && (
            <PhotoBubbleBody url={message.imageUrl} caption={message.body} isOwner={isOwner} />
          )}
          {message.kind === 'voice' && (
            <VoiceBubbleBody durationSec={message.durationSec ?? 0} transcript={message.body} isOwner={isOwner} />
          )}
          {message.kind === 'text' && <p className="whitespace-pre-wrap">{message.body}</p>}
        </div>

        <div
          className={cn(
            'mt-1 flex items-center gap-1 px-1 text-[10px] text-foreground/35',
            isOwner ? 'justify-end' : 'justify-start',
          )}
        >
          <span>{clockOf(message.sentAt)}</span>
          {isOwner && (
            <span>
              {message.read ? (
                <CheckCheck className="h-3 w-3 text-emerald-700 dark:text-emerald-300" />
              ) : (
                <Check className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Photo bubble body ───────────────────────────────────────────────────

function PhotoBubbleBody({ url, caption, isOwner }: { url: string; caption?: string; isOwner: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="-mx-4 -mt-2.5 mb-2.5">
      {!failed ? (
        <img
          src={url}
          alt="Attachment"
          className="block max-h-72 w-full min-w-[240px] object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="flex h-40 min-w-[240px] items-center justify-center"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(99,102,241,0.25), rgba(15,17,21,0.95))',
          }}
        >
          <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
            Photo unavailable
          </span>
        </div>
      )}
      {caption && (
        <p className={cn('mt-2 px-4 text-sm', isOwner ? 'text-foreground' : 'text-foreground/90')}>{caption}</p>
      )}
    </div>
  );
}

// ─── Voice bubble body ───────────────────────────────────────────────────

function VoiceBubbleBody({
  durationSec,
  transcript,
  isOwner,
}: {
  durationSec: number;
  transcript?: string;
  isOwner: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className={cn(
            'grid h-8 w-8 flex-shrink-0 place-items-center rounded-full transition-colors',
            isOwner ? 'bg-foreground/20 hover:bg-foreground/25' : 'bg-foreground/[0.08] hover:bg-foreground/[0.12]',
          )}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>

        {/* Fake waveform */}
        <div className="flex flex-1 items-end gap-0.5">
          {Array.from({ length: 24 }).map((_, i) => {
            const h = 4 + ((i * 7) % 16);
            return (
              <span
                key={i}
                className={cn(
                  'w-[2px] rounded-full',
                  isOwner ? 'bg-foreground/65' : 'bg-foreground/45',
                  playing && i < 12 && (isOwner ? 'bg-white' : 'bg-emerald-300'),
                )}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>

        <span className={cn('text-[11px] tabular-nums', isOwner ? 'text-foreground/85' : 'text-foreground/80 dark:text-foreground/65')}>
          {durationLabel(durationSec)}
        </span>
      </div>

      {transcript && (
        <div
          className={cn(
            'mt-2 rounded-lg px-3 py-2 text-xs italic',
            isOwner ? 'bg-foreground/15 text-foreground/85' : 'bg-foreground/[0.04] text-foreground/80 dark:text-foreground/65',
          )}
        >
          "{transcript}" <span className="not-italic opacity-60">— transcribed</span>
        </div>
      )}
    </div>
  );
}
