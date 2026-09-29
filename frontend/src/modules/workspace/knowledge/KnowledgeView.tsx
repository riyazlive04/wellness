import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookOpen, ChevronDown, FileText, Loader2, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { AnswerText } from './AnswerText';
import {
  knowledgeApi, KB_ACCEPTED_EXTENSIONS,
  type KbDocument, type KbPassage,
} from '@/modules/workspace/api/knowledge';

/** Starting points for people who don't know what to search for. */
const TOPICS = [
  'Assign a program to many clients',
  'Plate Vision accuracy',
  'Turn on AI features',
  'Client not in my roster',
  'Meal shows zero calories',
  'Brand the app as my practice',
];

/**
 * Help & guides — search the NUSI guide and the practice's own documents.
 *
 * A search page, not a chat: it shows the passages that match, each with its
 * source, and says plainly when nothing does. Nothing is generated, so what a
 * nutritionist reads is exactly what the guide or their document says.
 */
export function HelpGuidesView() {
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const docsQ = useQuery({ queryKey: ['knowledge', 'documents'], queryFn: knowledgeApi.list });
  const searchQ = useQuery({
    queryKey: ['knowledge', 'search', query],
    queryFn: () => knowledgeApi.search(query),
    enabled: query.length > 0,
    staleTime: 5 * 60_000,
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => knowledgeApi.upload(file),
    onSuccess: (doc) => {
      toast.success(`"${doc.title}" added, ${doc.chunk_count} sections`);
      qc.invalidateQueries({ queryKey: ['knowledge'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not add that file.'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => knowledgeApi.remove(id),
    onSuccess: () => {
      toast.success('Document removed');
      qc.invalidateQueries({ queryKey: ['knowledge'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not remove that document.'),
  });

  const docs = docsQ.data ?? [];
  const docById = new Map(docs.map((d) => [d.id, d]));
  const results = searchQ.data ?? [];

  const run = (q: string) => {
    const clean = q.trim();
    setInput(clean);
    setQuery(clean);
  };

  return (
    <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
      <motion.div variants={fadeUp}>
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">
          Help &amp; guides
        </span>
        <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight md:text-4xl">How can we help?</h1>
        <p className="mt-2 max-w-2xl text-sm text-foreground/60">
          Search the NUSI guide and your practice's own documents, like protocols and reference sheets.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── search ─────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="space-y-4 lg:col-span-2">
          <form
            onSubmit={(e) => { e.preventDefault(); run(input); }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Search, e.g. how do I assign a program?"
                maxLength={300}
                className="w-full rounded-2xl border border-foreground/10 bg-card py-3 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-foreground/25"
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || searchQ.isFetching}
              className="rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {searchQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => run(t)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs transition-colors',
                  query === t ? 'border-[hsl(var(--brand-blue))]/40 bg-[hsl(var(--brand-blue))]/[0.07]' : 'border-foreground/10 hover:bg-foreground/[0.04]',
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {query && (
            <div className="space-y-3">
              {searchQ.isLoading ? (
                <Glass className="flex items-center gap-2 p-5 text-sm text-foreground/55">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </Glass>
              ) : searchQ.isError ? (
                <Glass className="p-5 text-sm text-foreground/65">Search isn't available right now. Please try again.</Glass>
              ) : results.length === 0 ? (
                <Glass className="p-5 text-sm text-foreground/65">
                  Nothing matched <span className="font-semibold text-foreground">"{query}"</span>. Try other words, or pick a topic above.
                </Glass>
              ) : (
                <>
                  <div className="px-1 text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                    {results.length} result{results.length === 1 ? '' : 's'}
                  </div>
                  {results.map((p) => (
                    <ResultCard key={`${p.document_id}-${p.chunk_index}`} passage={p} doc={docById.get(p.document_id)} />
                  ))}
                </>
              )}
            </div>
          )}
        </motion.div>

        {/* ── documents ───────────────────────────────────────────── */}
        <motion.aside variants={fadeUp} className="space-y-4">
          <Glass className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-foreground/55" />
              <span className="text-sm font-semibold">Your documents</span>
            </div>
            <p className="mb-3 text-[11px] text-foreground/50">
              Add your practice's own material and it shows up in search for your team.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept={KB_ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadMut.mutate(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadMut.isPending}
              className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/15 px-3 py-3 text-sm hover:bg-foreground/[0.03] disabled:opacity-60"
            >
              {uploadMut.isPending
                ? (<><Loader2 className="h-4 w-4 animate-spin" /> Adding…</>)
                : (<><Upload className="h-4 w-4" /> Add a document</>)}
            </button>
            <p className="mb-3 text-[11px] text-foreground/45">
              PDF, Word, Markdown, text, CSV or JSON. Scanned PDFs need OCR first, because their pages are
              images with no text to search.
            </p>

            {docsQ.isLoading ? (
              <div className="flex items-center gap-2 py-4 text-xs text-foreground/55">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : docs.length === 0 ? (
              <div className="py-6 text-center text-xs text-foreground/50">No documents yet.</div>
            ) : (
              <ul className="space-y-1.5">
                {docs.map((d) => (
                  <DocumentRow
                    key={d.id}
                    doc={d}
                    onDelete={() => deleteMut.mutate(d.id)}
                    deleting={deleteMut.isPending && deleteMut.variables === d.id}
                  />
                ))}
              </ul>
            )}
          </Glass>
        </motion.aside>
      </div>
    </motion.div>
  );
}

function ResultCard({ passage, doc }: { passage: KbPassage; doc: KbDocument | undefined }) {
  const [open, setOpen] = useState(false);
  const shared = doc?.scope === 'platform';
  const long = passage.content.length > 600;
  return (
    <Glass className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
            shared ? 'bg-[hsl(var(--brand-blue))]/10 text-[hsl(var(--brand-blue))]' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
          )}
        >
          {shared ? 'NUSI guide' : 'Your document'}
        </span>
        {!shared && <span className="truncate text-[11px] text-foreground/50">{passage.title}</span>}
      </div>
      <h3 className="mt-2 text-sm font-semibold text-foreground">{passage.heading ?? passage.title}</h3>
      <div className={cn('relative mt-1.5 text-sm text-foreground/75', long && !open && 'max-h-40 overflow-hidden')}>
        <AnswerText answer={passage.content} compact />
        {long && !open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--brand-blue))]"
        >
          {open ? 'Show less' : 'Read more'}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      )}
    </Glass>
  );
}

function DocumentRow({ doc, onDelete, deleting }: { doc: KbDocument; onDelete: () => void; deleting: boolean }) {
  const failed = doc.status === 'failed';
  const busy = doc.status === 'pending' || doc.status === 'indexing';
  const shared = doc.scope === 'platform';
  return (
    <li className="group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-foreground/[0.03]">
      <FileText className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0', failed ? 'text-rose-500' : 'text-foreground/40')} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{doc.title}</div>
        <div className="text-[10px] text-foreground/45">
          {failed ? (
            <span className="text-rose-600 dark:text-rose-400">Failed: {doc.error_message ?? 'unknown error'}</span>
          ) : busy ? (
            'Adding…'
          ) : (
            <>
              {doc.chunk_count} section{doc.chunk_count === 1 ? '' : 's'}
              {shared && ' · from NUSI'}
            </>
          )}
        </div>
      </div>
      {/* The NUSI guide is shared by every practice; only super admins can remove it. */}
      {!shared && (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-40"
          aria-label={`Delete ${doc.title}`}
        >
          {deleting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/40" />
            : <Trash2 className="h-3.5 w-3.5 text-foreground/40 hover:text-rose-500" />}
        </button>
      )}
    </li>
  );
}
