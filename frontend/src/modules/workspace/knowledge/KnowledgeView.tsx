import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, FileText, Loader2, Search, Send, Sparkles, Trash2, Upload, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import {
  knowledgeApi, KB_ACCEPTED_EXTENSIONS,
  type KbAnswer, type KbDocument,
} from '@/modules/workspace/api/knowledge';

/**
 * Knowledge base — upload the documents the assistant answers from, and ask
 * questions against them.
 *
 * The design point of this screen is that an answer is never presented alone.
 * Every reply shows the passages it came from, and a question with no relevant
 * source says so instead of producing a confident paragraph. A nutritionist
 * has to be able to check the source before acting on the answer, so the
 * citations are part of the answer rather than a detail tucked behind a
 * disclosure.
 */

interface Turn {
  question: string;
  answer: KbAnswer | null;
}

export function KnowledgeView() {
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const docsQ = useQuery({ queryKey: ['knowledge', 'documents'], queryFn: knowledgeApi.list });

  const uploadMut = useMutation({
    mutationFn: (file: File) => knowledgeApi.upload(file),
    onSuccess: (doc) => {
      toast.success(`"${doc.title}" indexed — ${doc.chunk_count} passages`);
      qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not index that file.'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => knowledgeApi.remove(id),
    onSuccess: () => {
      toast.success('Document removed');
      qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not remove that document.'),
  });

  const askMut = useMutation({
    mutationFn: (q: string) => knowledgeApi.ask(q),
    onSuccess: (answer) =>
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, answer } : turn))),
    onError: (e: Error) => {
      toast.error(e.message ?? 'Could not answer that.');
      setTurns((t) => t.slice(0, -1));
    },
  });

  const docs = docsQ.data ?? [];
  const ready = docs.filter((d) => d.status === 'ready');
  const indexedPassages = ready.reduce((n, d) => n + d.chunk_count, 0);

  function submit() {
    const q = question.trim();
    if (!q || askMut.isPending) return;
    setTurns((t) => [...t, { question: q, answer: null }]);
    setQuestion('');
    askMut.mutate(q);
  }

  return (
    <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
      <motion.div variants={fadeUp}>
        <span className="text-[hsl(var(--brand-blue))] text-xs font-bold uppercase tracking-[0.18em]">
          Knowledge base
        </span>
        <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight md:text-4xl">Ask your documents</h1>
        <p className="mt-2 max-w-2xl text-sm text-foreground/60">
          Upload your protocols, guidelines and reference material. The assistant answers only from
          what you have indexed, and shows you the passage behind every answer.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── ask ─────────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="space-y-4 lg:col-span-2">
          <Glass className="flex min-h-[420px] flex-col p-4">
            <div className="flex-1 space-y-4 overflow-y-auto">
              {turns.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-foreground/[0.04]">
                    <Search className="h-5 w-5 text-foreground/40" />
                  </div>
                  <div className="text-sm text-foreground/60">
                    {ready.length === 0
                      ? 'Upload a document to get started — there is nothing indexed yet.'
                      : 'Ask anything covered by your indexed documents.'}
                  </div>
                  {ready.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {['How do I assign a program to many clients?',
                        'Can I rely on photo-scanned calories?',
                        'What reports can I generate?'].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setQuestion(s)}
                          className="rounded-full border border-foreground/10 px-3 py-1.5 text-xs hover:bg-foreground/[0.04]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <AnimatePresence initial={false}>
                {turns.map((turn, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                  >
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-3.5 py-2 text-sm text-white">
                        {turn.question}
                      </div>
                    </div>

                    {turn.answer === null ? (
                      <div className="flex items-center gap-2 text-xs text-foreground/55">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching your documents…
                      </div>
                    ) : (
                      <Answer answer={turn.answer} />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-foreground/[0.06] pt-3">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submit())}
                placeholder={ready.length ? 'Ask a question…' : 'Index a document first'}
                disabled={!ready.length}
                className="flex-1 rounded-xl border border-foreground/10 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-foreground/25 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!question.trim() || askMut.isPending || !ready.length}
                className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white disabled:opacity-40"
                aria-label="Ask"
              >
                {askMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </Glass>
        </motion.div>

        {/* ── documents ───────────────────────────────────────────── */}
        <motion.aside variants={fadeUp} className="space-y-4">
          <Glass className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-foreground/55" />
                <span className="text-sm font-semibold">Documents</span>
              </div>
              <span className="text-[11px] text-foreground/45">
                {indexedPassages} passage{indexedPassages === 1 ? '' : 's'}
              </span>
            </div>

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
                ? (<><Loader2 className="h-4 w-4 animate-spin" /> Indexing…</>)
                : (<><Upload className="h-4 w-4" /> Upload a document</>)}
            </button>
            <p className="mb-3 text-[11px] text-foreground/45">
              Markdown, text, CSV or JSON. PDF and Word are not supported yet.
            </p>

            {docsQ.isLoading ? (
              <div className="flex items-center gap-2 py-4 text-xs text-foreground/55">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : docs.length === 0 ? (
              <div className="py-6 text-center text-xs text-foreground/50">Nothing indexed yet.</div>
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

          <Glass className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-foreground/55" />
              <span className="text-sm font-semibold">How answers work</span>
            </div>
            <ul className="space-y-2 text-xs text-foreground/60">
              <li>Answers come only from your indexed documents, never from the model's general knowledge.</li>
              <li>Every answer cites the passages behind it, so you can check before acting.</li>
              <li>If nothing relevant is indexed, it says so rather than guessing.</li>
            </ul>
          </Glass>
        </motion.aside>
      </div>
    </motion.div>
  );
}

function DocumentRow({ doc, onDelete, deleting }: { doc: KbDocument; onDelete: () => void; deleting: boolean }) {
  const failed = doc.status === 'failed';
  const busy = doc.status === 'pending' || doc.status === 'indexing';
  return (
    <li className="group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-foreground/[0.03]">
      <FileText className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0', failed ? 'text-rose-500' : 'text-foreground/40')} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{doc.title}</div>
        <div className="text-[10px] text-foreground/45">
          {failed ? (
            <span className="text-rose-600 dark:text-rose-400">Failed — {doc.error_message ?? 'unknown error'}</span>
          ) : busy ? (
            'Indexing…'
          ) : (
            <>
              {doc.chunk_count} passage{doc.chunk_count === 1 ? '' : 's'}
              {/* Platform documents are shared, so make clear this one is not the practice's own. */}
              {doc.scope === 'platform' && ' · shared'}
            </>
          )}
        </div>
      </div>
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
    </li>
  );
}

function Answer({ answer }: { answer: KbAnswer }) {
  if (answer.outcome === 'no_match') {
    return (
      <div className="flex items-start gap-2.5 rounded-2xl rounded-bl-sm border border-amber-400/25 bg-amber-500/[0.07] px-3.5 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="text-sm text-foreground/75">{answer.answer}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-2xl rounded-bl-sm bg-foreground/[0.04] px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap">
        {answer.answer}
      </div>

      {answer.citations.length > 0 && (
        <div className="pl-1">
          <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-foreground/45">Sources</div>
          <ul className="space-y-1">
            {answer.citations.map((c, i) => (
              <li key={`${c.document_id}-${c.chunk_index}`} className="flex items-start gap-2 text-[11px] text-foreground/60">
                <span className="mt-px font-mono text-foreground/40">[{i + 1}]</span>
                <span className="flex-1">
                  {c.heading ?? c.title}
                  <span className="ml-1.5 text-foreground/35">{c.title}</span>
                </span>
                {/* Surfaced so a weak match is visible rather than implied. */}
                <span className="tabular-nums text-foreground/35">{Math.round(c.similarity * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
