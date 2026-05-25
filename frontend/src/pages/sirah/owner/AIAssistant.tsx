import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, User, AlertTriangle, BarChart3, Mic, Mail, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { ChatComposer } from '@/modules/workspace/ai-assistant/components/ChatComposer';
import { MessageBubble } from '@/modules/workspace/ai-assistant/components/MessageBubble';
import {
  FALLBACK_INTENT,
  INTENTS,
  resolveIntent,
} from '@/modules/workspace/ai-assistant/data/intents';
import type { Message, PromptIntent } from '@/modules/workspace/ai-assistant/types';
import { cn } from '@/lib/utils';

const ICONS = {
  user:     User,
  alert:    AlertTriangle,
  sparkles: Sparkles,
  chart:    BarChart3,
  mic:      Mic,
  mail:     Mail,
} as const;

export default function OwnerAIAssistant() {
  const workspace = readWorkspace();
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, thinking]);

  const isEmpty = messages.length === 0 && !thinking;

  function send(text: string) {
    const userMsg: Message = {
      id: `m_${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setThinking(true);

    // Simulate AI response after ~900ms
    const intent = resolveIntent(text);
    const response = intent?.response ?? FALLBACK_INTENT;

    window.setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: `m_${Math.random().toString(36).slice(2, 8)}`,
          role: 'assistant',
          ...response,
          createdAt: new Date().toISOString(),
        },
      ]);
      setThinking(false);
    }, 900);
  }

  function reset() {
    setMessages([]);
    setThinking(false);
  }

  // Suggestions from the latest assistant message
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const suggestions = !thinking && lastAssistant?.suggestions ? lastAssistant.suggestions : [];

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext="AI Assistant · workspace-grounded"
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="flex h-[calc(100vh-64px)] flex-col">
        {/* Header strip */}
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0A0C10]/85 px-6 py-3 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <AIGlow intensity="soft" animated className="rounded-full">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </span>
            </AIGlow>
            <div>
              <div className="text-sm font-medium text-white">AI Assistant</div>
              <div className="text-[10px] text-white/45">
                Grounded in your workspace · GPT-4o + Claude routing
              </div>
            </div>
          </div>
          {!isEmpty && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/[0.06]"
            >
              <RotateCcw className="h-3 w-3" />
              New chat
            </button>
          )}
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto w-full max-w-3xl">
            {isEmpty ? (
              <EmptyState onPick={send} />
            ) : (
              <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
                {messages.map((m) => (
                  <motion.div key={m.id} variants={fadeUp}>
                    <MessageBubble message={m} />
                  </motion.div>
                ))}

                {/* Thinking state */}
                {thinking && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" />
                    <span className="text-xs text-white/55">SIRAH is reading your workspace…</span>
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-white/[0.06] bg-[#0A0C10]/85 px-6 py-4 backdrop-blur-md">
          <div className="mx-auto w-full max-w-3xl">
            <ChatComposer
              onSend={send}
              suggestions={suggestions}
              disabled={thinking}
              placeholder={isEmpty ? "Ask SIRAH anything about your workspace…" : "Follow up…"}
            />
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <motion.div
      variants={stagger(0.08, 0.06)}
      initial="initial"
      animate="animate"
      className="space-y-8"
    >
      {/* Greeting */}
      <motion.div variants={fadeUp} className="text-center">
        <div className="mx-auto mb-5 w-fit">
          <AIGlow intensity="default" animated>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
          </AIGlow>
        </div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-white">
          What can SIRAH help with?
        </h1>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-white/55">
          Ask in plain English. SIRAH reads your clients, programs, messages, and metrics to answer
          and take action.
        </p>
      </motion.div>

      {/* Action tiles */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {INTENTS.map((intent) => (
          <ActionTile key={intent.id} intent={intent} onPick={() => onPick(intent.prompt)} />
        ))}
      </motion.div>

      {/* Capabilities footer */}
      <motion.div variants={fadeUp} className="text-center text-[11px] text-white/35">
        SIRAH AI can also: draft messages · summarize calls · suggest plan changes · flag at-risk
        clients · explain a metric · translate between tones.
      </motion.div>
    </motion.div>
  );
}

function ActionTile({ intent, onPick }: { intent: PromptIntent; onPick: () => void }) {
  const Icon = ICONS[intent.icon];
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'group flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-left transition-all',
        'hover:-translate-y-0.5 hover:border-violet-400/30 hover:bg-white/[0.04]',
      )}
    >
      <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15 text-violet-200 transition-colors group-hover:from-violet-500/30 group-hover:to-emerald-400/25">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-white">{intent.label}</div>
        <div className="mt-1 text-xs text-white/55">{intent.description}</div>
        <div className="mt-2 truncate text-[11px] italic text-violet-300/80">
          "{intent.prompt}"
        </div>
      </div>
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
