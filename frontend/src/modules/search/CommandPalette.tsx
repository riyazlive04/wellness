import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Loader2, Users, CalendarRange, Utensils, CornerDownLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { searchApi, OPEN_SEARCH_EVENT, type SearchResult, type SearchResultType } from './searchApi';

const TYPE_META: Record<SearchResultType, { icon: typeof Users; label: string }> = {
  client:  { icon: Users,         label: 'Clients' },
  program: { icon: CalendarRange, label: 'Programs' },
  recipe:  { icon: Utensils,      label: 'Recipes' },
};

/**
 * Global command palette (Cmd/Ctrl-K) for staff. Searches clients, programs,
 * and recipes in the current workspace. Mounted once in the owner shell; opens
 * on the hotkey or the OPEN_SEARCH_EVENT (fired by the topbar search button).
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hotkey (Cmd/Ctrl-K) + custom open event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  // Reset + focus on open.
  useEffect(() => {
    if (open) {
      setQ('');
      setDebounced('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  // Debounce the query.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const resultsQ = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchApi.query(debounced),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  const results = debounced.length >= 2 ? resultsQ.data ?? [] : [];

  useEffect(() => { setActive(0); }, [debounced]);

  function go(r: SearchResult) {
    setOpen(false);
    navigate(r.url);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[active]; if (r) go(r); }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-foreground/[0.06] px-4">
              <Search className="h-4 w-4 flex-shrink-0 text-foreground/45" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search clients, programs, recipes…"
                className="flex-1 bg-transparent py-3.5 text-sm placeholder:text-foreground/40 focus:outline-none"
              />
              {resultsQ.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/40" />}
              <kbd className="rounded border border-foreground/15 px-1.5 py-0.5 text-[10px] text-foreground/45">Esc</kbd>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-2">
              {debounced.length < 2 ? (
                <div className="px-3 py-8 text-center text-sm text-foreground/45">Type at least 2 characters to search.</div>
              ) : results.length === 0 && !resultsQ.isFetching ? (
                <div className="px-3 py-8 text-center text-sm text-foreground/55">No matches for “{debounced}”.</div>
              ) : (
                <ul>
                  {results.map((r, i) => {
                    const meta = TYPE_META[r.type];
                    return (
                      <li key={`${r.type}:${r.id}`}>
                        <button
                          type="button"
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(r)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left',
                            i === active ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.03]',
                          )}
                        >
                          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600/15 to-fuchsia-500/15 text-violet-700 dark:text-violet-300">
                            <meta.icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{r.label}</span>
                            {r.sublabel && <span className="block truncate text-[11px] text-foreground/55">{r.sublabel}</span>}
                          </span>
                          <span className="text-[10px] uppercase tracking-[0.14em] text-foreground/40">{meta.label.slice(0, -1)}</span>
                          {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-foreground/40" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
