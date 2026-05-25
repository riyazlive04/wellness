import { useState } from 'react';
import { Image, Hash, Pin, Sparkles, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';

interface PostComposerProps {
  onPost: (payload: { body: string; pin: boolean; cohort: string }) => void;
}

const QUICK_COHORTS = ['All cohorts', 'PCOS Reset', 'Muscle Gain', 'Diabetes Care', 'Cardiac Care', 'Vegan Strength'];

export function PostComposer({ onPost }: PostComposerProps) {
  const [body, setBody] = useState('');
  const [pin, setPin] = useState(false);
  const [cohort, setCohort] = useState('All cohorts');
  const [expanded, setExpanded] = useState(false);
  const [cohortOpen, setCohortOpen] = useState(false);

  function handlePost() {
    if (!body.trim()) return;
    onPost({ body: body.trim(), pin, cohort });
    setBody('');
    setPin(false);
    setExpanded(false);
  }

  return (
    <Glass variant="heavy" className="overflow-hidden">
      <div className="flex items-start gap-3 px-5 pt-5">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/35 to-fuchsia-500/25 text-xs font-medium">
          YO
        </div>
        <div className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder="Share an announcement, a win, a question…"
            rows={expanded ? 4 : 1}
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-white placeholder:text-white/35 focus:outline-none"
          />
        </div>
      </div>

      {/* Expanded controls */}
      {(expanded || body) && (
        <div className="space-y-3 px-5 py-3">
          {/* Cohort picker + pin toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setCohortOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/85 hover:bg-white/[0.06]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {cohort}
              </button>
              {cohortOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCohortOpen(false)} />
                  <div className="absolute left-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#15171C] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]">
                    {QUICK_COHORTS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setCohort(c);
                          setCohortOpen(false);
                        }}
                        className={cn(
                          'block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.05]',
                          cohort === c ? 'text-white' : 'text-white/65',
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setPin((p) => !p)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition-colors',
                pin
                  ? 'border-indigo-400/50 bg-indigo-400/[0.08] text-indigo-200'
                  : 'border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]',
              )}
            >
              <Pin className={cn('h-3 w-3', pin && 'fill-current')} />
              {pin ? 'Pinned to top' : 'Pin to top'}
            </button>
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toast('Photo upload lands with the Storage module.')}
                className="grid h-8 w-8 place-items-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white"
                aria-label="Add photo"
              >
                <Image className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setBody((b) => `${b} #`)}
                className="grid h-8 w-8 place-items-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white"
                aria-label="Add hashtag"
              >
                <Hash className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => toast('SIRAH-drafted posts ship with the AI module.')}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] text-indigo-300 transition-colors hover:bg-indigo-400/[0.08]"
              >
                <Sparkles className="h-3 w-3" />
                Ask SIRAH to draft
              </button>
            </div>
            <div className="flex items-center gap-2">
              {expanded && (
                <button
                  type="button"
                  onClick={() => {
                    setBody('');
                    setExpanded(false);
                    setPin(false);
                  }}
                  className="grid h-8 w-8 place-items-center rounded-lg text-white/40 hover:text-white"
                  aria-label="Discard"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePost}
                disabled={!body.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-1.5 text-xs font-medium text-white transition-transform duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Post
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </Glass>
  );
}
