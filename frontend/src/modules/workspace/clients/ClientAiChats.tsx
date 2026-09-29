import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronDown, Loader2, MessagesSquare, Sparkles } from 'lucide-react';

import { Glass } from '@/design-system';
import { clientAssistantApi, type ClientAssistantConversation } from '@/modules/workspace/api/clientAssistant';
import { cn } from '@/lib/utils';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

/**
 * A client's conversations with their AI assistant, read-only, so the
 * nutritionist can see what the client asked and what the AI told them.
 */
export function ClientAiChats({ clientId }: { clientId: string }) {
  const chatsQ = useQuery({
    queryKey: ['clients', clientId, 'assistant-conversations'],
    queryFn: () => clientAssistantApi.conversations(clientId),
  });
  const settingsQ = useQuery({ queryKey: ['workspace', 'client-assistant'], queryFn: clientAssistantApi.get, retry: 0 });

  if (chatsQ.isLoading) {
    return (
      <Glass className="flex items-center gap-2 p-6 text-sm text-foreground/55">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading chats…
      </Glass>
    );
  }
  if (chatsQ.isError) {
    return <Glass className="p-6 text-sm text-foreground/65">Couldn't load this client's AI chats.</Glass>;
  }

  const chats = chatsQ.data ?? [];
  const off = settingsQ.data && !settingsQ.data.enabled;

  return (
    <div className="space-y-3">
      {off && (
        <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-3 text-xs text-foreground/65">
          The client AI assistant is off for your practice, so this client can't start new AI chats.{' '}
          <Link to="/settings?tab=ai" className="font-semibold text-[hsl(var(--brand-blue))] hover:underline">Settings → AI</Link>
        </div>
      )}
      {chats.length === 0 ? (
        <Glass className="flex flex-col items-center gap-2 p-8 text-center">
          <MessagesSquare className="h-6 w-6 text-foreground/35" />
          <div className="text-sm text-foreground/60">No AI chats with this client yet.</div>
        </Glass>
      ) : (
        chats.map((c, i) => <Conversation key={c.id} chat={c} defaultOpen={i === 0} />)
      )}
    </div>
  );
}

function Conversation({ chat, defaultOpen }: { chat: ClientAssistantConversation; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const questions = chat.messages.filter((m) => m.role === 'user').length;
  return (
    <Glass className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-foreground/[0.02]"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{chat.title || 'Chat'}</div>
          <div className="text-[11px] text-foreground/50">
            {questions} question{questions === 1 ? '' : 's'} · {fmt(chat.last_message_at ?? chat.created_at)}
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-foreground/45 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-foreground/[0.06] px-5 py-4">
          {chat.messages.length === 0 && <div className="text-xs text-foreground/50">No messages.</div>}
          {chat.messages.map((m, i) => {
            const mine = m.role === 'user';
            return (
              <div key={i} className={cn('flex', mine ? 'justify-start' : 'justify-end')}>
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm',
                    mine ? 'rounded-bl-sm bg-foreground/[0.05] text-foreground' : 'rounded-br-sm bg-[hsl(var(--brand-blue))]/[0.08] text-foreground/85',
                  )}
                >
                  <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/45">
                    {mine ? 'Client' : (<><Sparkles className="h-3 w-3" /> AI assistant</>)}
                    <span className="font-normal normal-case tracking-normal">· {fmt(m.created_at)}</span>
                  </div>
                  {m.content}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Glass>
  );
}
