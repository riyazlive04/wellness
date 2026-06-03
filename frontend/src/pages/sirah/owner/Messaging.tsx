import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  Phone,
  Video,
  MoreVertical,
  User as UserIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { ConversationList } from '@/modules/workspace/messaging/components/ConversationList';
import { MessageBubble } from '@/modules/workspace/messaging/components/MessageBubble';
import { Composer } from '@/modules/workspace/messaging/components/Composer';
import { BulkMessageDialog } from '@/modules/workspace/messaging/components/BulkMessageDialog';
import { MOCK_CONVERSATIONS } from '@/modules/workspace/messaging/data/mockConversations';
import { initialsOf, relativeTime } from '@/modules/workspace/messaging/helpers';
import type { Conversation, Message } from '@/modules/workspace/messaging/types';
import { cn } from '@/lib/utils';

export default function OwnerMessaging() {
  const workspace = readWorkspace();
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Local conversations state so the demo can append messages
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    [...MOCK_CONVERSATIONS].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    ),
  );

  // Active conversation derived from URL or default to first
  const activeId = routeId ?? conversations[0]?.id ?? null;
  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const [bulkOpen, setBulkOpen] = useState(false);

  // Auto-scroll to bottom when active conversation changes or grows
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [active?.id, active?.messages.length]);

  // Mark unread cleared on open
  useEffect(() => {
    if (!active) return;
    if (active.unread > 0) {
      setConversations((cs) =>
        cs.map((c) => (c.id === active.id ? { ...c, unread: 0 } : c)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  function selectConversation(id: string) {
    navigate(`/messaging/${id}`);
  }

  function backToList() {
    navigate('/messaging');
  }

  function sendMessage(text: string) {
    if (!active) return;
    const msg: Message = {
      id: Math.random().toString(36).slice(2, 9),
      author: 'owner',
      kind: 'text',
      body: text,
      sentAt: new Date().toISOString(),
      read: false,
    };
    setConversations((cs) =>
      cs.map((c) =>
        c.id === active.id
          ? { ...c, messages: [...c.messages, msg], lastMessageAt: msg.sentAt }
          : c,
      ),
    );
  }

  // Suggestions from the latest non-owner message
  const suggestions = useMemo<string[]>(() => {
    if (!active) return [];
    for (let i = active.messages.length - 1; i >= 0; i--) {
      const m = active.messages[i];
      if (m.aiSuggestions && m.aiSuggestions.length > 0) return m.aiSuggestions;
      if (m.author === 'owner') break;
    }
    return [];
  }, [active]);

  const templateVars = active
    ? {
        name: active.clientName.split(' ')[0],
        program: active.program.split(' · ')[0] ?? active.program,
      }
    : { name: '', program: '' };

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${conversations.filter((c) => c.unread > 0).length} unread`}
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="grid h-[calc(100vh-64px)] grid-cols-1 md:grid-cols-[320px_1fr]">
        {/* Left pane — hidden on mobile when a conversation is open */}
        <div className={cn('h-full overflow-hidden', routeId ? 'hidden md:block' : 'block')}>
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={selectConversation}
            onBulkClick={() => setBulkOpen(true)}
          />
        </div>

        {/* Right pane — the active conversation */}
        <div className={cn('flex h-full flex-col bg-canvas', !routeId && 'hidden md:flex')}>
          {active ? (
            <>
              {/* Header */}
              <header className="flex items-center justify-between border-b border-foreground/[0.06] bg-canvas/85 px-4 py-3 backdrop-blur-md">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={backToList}
                    className="grid h-9 w-9 place-items-center rounded-lg text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground md:hidden"
                    aria-label="Back"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
                    {initialsOf(active.clientName)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/clients/${active.clientId}`}
                        className="truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {active.clientName}
                      </Link>
                      {active.flag === 'urgent' && (
                        <span className="rounded-full border border-rose-400/40 bg-rose-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-200">
                          Urgent
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-foreground/60">
                      {active.program} · last active {relativeTime(active.lastMessageAt)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <HeaderAction icon={Phone} label="Call" onClick={() => toast('Calling lands with the Appointments module.')} />
                  <HeaderAction icon={Video} label="Video" onClick={() => toast('Video consult lands with the Appointments module.')} />
                  <Link
                    to={`/clients/${active.clientId}`}
                    className="hidden grid-cols-1 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] text-foreground/65 hover:bg-foreground/[0.05] hover:text-foreground md:inline-flex"
                  >
                    <UserIcon className="h-3.5 w-3.5" />
                    Profile
                  </Link>
                  <HeaderAction icon={MoreVertical} label="More" onClick={() => toast('Conversation settings live in the right panel — soon.')} />
                </div>
              </header>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 30% 0%, rgba(99,102,241,0.06), transparent 50%),' +
                    'radial-gradient(circle at 80% 100%, rgba(125,190,157,0.05), transparent 55%)',
                }}
              >
                <div className="mx-auto flex max-w-3xl flex-col gap-3">
                  {active.messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                </div>
              </div>

              {/* Composer */}
              <Composer
                suggestions={suggestions}
                onSend={sendMessage}
                templateVars={templateVars}
                placeholder={`Message ${active.clientName.split(' ')[0]}…`}
              />
            </>
          ) : (
            <EmptyConversationState />
          )}
        </div>
      </div>

      <BulkMessageDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </OwnerLayout>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function HeaderAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg text-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function EmptyConversationState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.32 }}
      className="flex flex-1 flex-col items-center justify-center px-6 text-center"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15 text-violet-700 dark:text-violet-200">
        💬
      </div>
      <h2 className="mt-4 text-base font-medium text-foreground">Select a conversation</h2>
      <p className="mt-1 max-w-sm text-sm text-foreground/55">
        Your clients' messages live here. SIRAH AI surfaces context-aware reply suggestions when you
        open a thread.
      </p>
    </motion.div>
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
