import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, Sparkles, X } from 'lucide-react';

import { aiKeyApi } from '@/modules/workspace/api/aiKey';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'nusi:ai-key-banner-dismissed';
const today = () => new Date().toISOString().slice(0, 10);

function dismissedToday(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === today(); } catch { return false; }
}

/**
 * Tells the practice owner when AI is off because the practice has no AI key
 * of its own (or its key stopped working), with a button to Settings -> AI.
 * Owner-only: staff can't add a key. Dismissing hides it until tomorrow.
 */
export function AiKeyBanner() {
  const { data: scope } = useScope();
  const { pathname, search } = useLocation();
  const [dismissed, setDismissed] = useState(dismissedToday);
  const isOwner = scope?.workspaceRole === 'owner' && !!scope?.workspaceId;

  const keyQ = useQuery({
    queryKey: ['workspace', 'ai-key'],
    queryFn: aiKeyApi.get,
    enabled: isOwner,
    retry: 0,
    staleTime: 5 * 60_000,
  });

  const status = keyQ.data?.status;
  const onAiSettings = pathname === '/settings' && new URLSearchParams(search).get('tab') === 'ai';
  if (!isOwner || dismissed || onAiSettings || !status || status === 'connected') return null;

  const broken = status === 'error';
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, today()); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-xs md:px-6',
        broken ? 'bg-rose-500/15 text-rose-800 dark:text-rose-200' : 'bg-amber-500/15 text-amber-900 dark:text-amber-200',
      )}
    >
      {broken ? <AlertTriangle className="h-4 w-4 flex-shrink-0" /> : <Sparkles className="h-4 w-4 flex-shrink-0" />}
      <span className="min-w-0 flex-1">
        {broken ? (
          <><span className="font-semibold">Your AI key stopped working.</span> The AI assistant, plate scanner, voice notes and AI meal plans are paused until it's fixed.</>
        ) : (
          <><span className="font-semibold">AI is off for your practice.</span> Add your own Google Gemini or OpenAI key to turn on the AI assistant, plate scanner, voice notes and AI meal plans. It takes about 2 minutes.</>
        )}
      </span>
      <Link
        to="/settings?tab=ai"
        className={cn(
          'flex-shrink-0 rounded-full px-3 py-1 font-semibold transition-colors',
          broken ? 'bg-rose-500/25 hover:bg-rose-500/40' : 'bg-amber-500/30 hover:bg-amber-500/45',
        )}
      >
        {broken ? 'Fix key' : 'Add AI key'}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full opacity-70 hover:bg-foreground/10 hover:opacity-100"
        aria-label="Hide until tomorrow"
        title="Hide until tomorrow"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
