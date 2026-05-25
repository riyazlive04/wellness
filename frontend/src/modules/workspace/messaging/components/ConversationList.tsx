import { useMemo, useState } from 'react';
import { Search, Send } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Conversation } from '../types';
import { initialsOf, relativeTime } from '../helpers';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onBulkClick: () => void;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onBulkClick,
}: ConversationListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.clientName.toLowerCase().includes(q) ||
        c.program.toLowerCase().includes(q) ||
        c.messages.some((m) => m.body.toLowerCase().includes(q)),
    );
  }, [conversations, query]);

  return (
    <div className="flex h-full flex-col border-r border-foreground/[0.06] bg-canvas/60 backdrop-blur-md">
      {/* Header */}
      <div className="border-b border-foreground/[0.06] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Messages</h2>
          <button
            type="button"
            onClick={onBulkClick}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[11px] text-foreground/85 transition-colors hover:bg-foreground/[0.06]"
          >
            <Send className="h-3 w-3" />
            Bulk
          </button>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/55" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, message…"
            className="w-full rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] py-1.5 pl-9 pr-3 text-sm placeholder:text-foreground/60 focus:border-violet-400/50 focus:bg-foreground/[0.05] focus:outline-none"
          />
        </div>
      </div>

      {/* List */}
      <ul className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="p-8 text-center text-xs text-foreground/55">No conversations match "{query}"</li>
        ) : (
          filtered.map((c) => {
            const last = c.messages[c.messages.length - 1];
            const lastSnippet =
              last?.kind === 'photo'
                ? '📷 Photo'
                : last?.kind === 'voice'
                  ? '🎤 Voice note'
                  : last?.body ?? '';
            const isActive = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    'group flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors',
                    isActive
                      ? 'border-l-violet-400 bg-foreground/[0.05]'
                      : 'border-l-transparent hover:bg-foreground/[0.03]',
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
                      {initialsOf(c.clientName)}
                    </div>
                    {c.flag === 'urgent' && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-canvas bg-rose-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{c.clientName}</span>
                      <span className="flex-shrink-0 text-[10px] text-foreground/55">
                        {relativeTime(c.lastMessageAt)}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-foreground/55">{c.program}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={cn('truncate text-xs', c.unread > 0 ? 'text-foreground/85' : 'text-foreground/50')}>
                        {lastSnippet}
                      </span>
                      {c.unread > 0 && (
                        <span className="ml-auto inline-flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-emerald-400 px-1.5 text-[10px] font-medium text-canvas">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
