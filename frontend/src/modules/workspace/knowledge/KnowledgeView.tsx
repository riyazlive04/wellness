import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BookOpen, Calendar, Camera, ChevronDown, ChevronRight, ClipboardList, CreditCard, Download, FileText, Loader2,
  Play, Rocket, Search, Trash2, Upload, Users, X, type LucideIcon,
} from 'lucide-react';
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

/** Browse by area: each card runs a search for its subject. */
const AREAS: Array<{ icon: LucideIcon; color: string; title: string; blurb: string; query: string }> = [
  { icon: Rocket, color: '#2f8f46', title: 'Getting started', blurb: 'Set up your practice, invite your team, add clients', query: 'getting started set up practice' },
  { icon: Users, color: '#0ea5e9', title: 'Clients', blurb: 'Join link, approvals, profiles, client records', query: 'clients join link approve' },
  { icon: ClipboardList, color: '#f59e0b', title: 'Programs & meal plans', blurb: 'Build programs, assign to many, weekly plans', query: 'program meal plan assign' },
  { icon: Camera, color: '#ec4899', title: 'Plate Vision & AI', blurb: 'Meal photos, accuracy, AI credits, your own key', query: 'plate vision AI credits' },
  { icon: Calendar, color: '#14b8a6', title: 'Appointments & video', blurb: 'Booking hours, requests, video calls', query: 'appointments booking video call' },
  { icon: CreditCard, color: '#8b5cf6', title: 'Billing & plans', blurb: 'Plans, invoices, coupons, cancelling', query: 'billing plan invoice' },
];

/**
 * Short how-to videos. Put a YouTube (or any) link in `url` to make a card
 * play; cards without one show "Coming soon".
 */
const VIDEOS: Array<{ title: string; length: string; color: string; url: string | null }> = [
  { title: 'Add your first client', length: '2 min', color: '#2f8f46', url: null },
  { title: 'Build a meal plan', length: '4 min', color: '#f59e0b', url: null },
  { title: 'Plate Vision in 60 seconds', length: '1 min', color: '#ec4899', url: null },
  { title: 'Run a video consultation', length: '3 min', color: '#14b8a6', url: null },
];

/** The PDF user guides, built by scripts/user-guide and served from /guides. */
type GuideFile = { no: number; slug: string; title: string; tagline: string; file: string; pages: number; kb: number };
type GuideIndex = { complete: { file: string; pages: number; kb: number }; guides: GuideFile[] };

const fetchGuides = async (): Promise<GuideIndex> => {
  const res = await fetch('/guides/index.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Guides are not available');
  return res.json();
};

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

  const documentsPanel = (
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
  );

  return (
    <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-8">
      {/* ── search hero ─────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="rounded-[28px] bg-gradient-to-b from-[hsl(var(--brand-blue)_/_0.12)] to-transparent px-4 pb-6 pt-8 text-center md:px-10"
      >
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">
          Help &amp; guides
        </span>
        <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight md:text-4xl">How can we help?</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-foreground/60">
          Search the NUSI guide and your practice's own documents, like protocols and reference sheets.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); run(input); }} className="mx-auto mt-5 max-w-3xl">
          <div className="flex items-center gap-2 rounded-2xl border border-foreground/10 bg-card p-1.5 pl-4 shadow-[0_14px_34px_-20px_rgba(16,60,30,0.45)]">
            <Search className="h-5 w-5 flex-shrink-0 text-foreground/40" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search, e.g. how do I assign a program?"
              maxLength={300}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none"
            />
            {query && (
              <button type="button" onClick={() => { setInput(''); setQuery(''); }} aria-label="Clear search"
                className="grid h-9 w-9 place-items-center rounded-xl text-foreground/40 hover:bg-foreground/[0.05]">
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || searchQ.isFetching}
              className="rounded-xl bg-[hsl(var(--brand-blue))] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {searchQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </button>
          </div>
        </form>
        <div className="mx-auto mt-4 flex max-w-3xl flex-wrap justify-center gap-2">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => run(t)}
              className={cn(
                'rounded-full border bg-card px-3.5 py-1.5 text-xs font-semibold transition-colors',
                query === t ? 'border-[hsl(var(--brand-blue))]/40 text-[hsl(var(--brand-blue))]' : 'border-foreground/10 text-foreground/70 hover:bg-foreground/[0.04]',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <motion.div variants={fadeUp} className="min-w-0 space-y-3">
          {query ? (
            searchQ.isLoading ? (
              <Glass className="flex items-center gap-2 p-5 text-sm text-foreground/55">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </Glass>
            ) : searchQ.isError ? (
              <Glass className="p-5 text-sm text-foreground/65">Search isn't available right now. Please try again.</Glass>
            ) : results.length === 0 ? (
              <Glass className="p-5 text-sm text-foreground/65">
                Nothing matched <span className="font-semibold text-foreground">"{query}"</span>. Try other words, or pick a topic.
              </Glass>
            ) : (
              <>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                    {results.length} result{results.length === 1 ? '' : 's'} for "{query}"
                  </span>
                  <button type="button" onClick={() => { setInput(''); setQuery(''); }} className="text-xs font-semibold text-[hsl(var(--brand-blue))]">
                    Browse topics
                  </button>
                </div>
                {results.map((p) => (
                  <ResultCard key={`${p.document_id}-${p.chunk_index}`} passage={p} doc={docById.get(p.document_id)} />
                ))}
              </>
            )
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {AREAS.map((a) => (
                <button
                  key={a.title}
                  type="button"
                  onClick={() => run(a.query)}
                  className="group flex flex-col rounded-3xl border border-foreground/[0.06] bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: `${a.color}1f`, color: a.color }}>
                    <a.icon className="h-5 w-5" />
                  </span>
                  <span className="mt-3 text-[15px] font-extrabold">{a.title}</span>
                  <span className="mt-0.5 text-xs text-foreground/60">{a.blurb}</span>
                  <span className="mt-3 inline-flex items-center gap-0.5 text-xs font-bold text-[hsl(var(--brand-blue))]">
                    Browse <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
        <motion.aside variants={fadeUp} className="space-y-4">{documentsPanel}</motion.aside>
      </div>

      <UserGuides />

      {/* ── videos ──────────────────────────────────────────────── */}
      <motion.section variants={fadeUp}>
        <h2 className="text-base font-extrabold">Watch how it works</h2>
        <p className="mt-0.5 text-xs text-foreground/55">Short videos for the things you do most.</p>
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {VIDEOS.map((v) => {
            const card = (
              <>
                <div className="relative grid h-32 place-items-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${v.color}38, ${v.color}10)` }}>
                  <span className={cn('grid h-12 w-12 place-items-center rounded-full bg-white shadow', !v.url && 'opacity-60')}>
                    <Play className="ml-0.5 h-5 w-5 text-slate-800" />
                  </span>
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 text-[11px] font-bold text-white">
                    {v.url ? v.length : 'Coming soon'}
                  </span>
                </div>
                <div className="mt-2 text-[13.5px] font-bold">{v.title}</div>
              </>
            );
            return v.url ? (
              <a key={v.title} href={v.url} target="_blank" rel="noreferrer" className="block transition-transform hover:-translate-y-0.5">{card}</a>
            ) : (
              <div key={v.title} title="Video coming soon">{card}</div>
            );
          })}
        </div>
      </motion.section>
    </motion.div>
  );
}

function UserGuides() {
  const guidesQ = useQuery({ queryKey: ['help', 'guides'], queryFn: fetchGuides, staleTime: 60 * 60_000 });
  const data = guidesQ.data;
  if (guidesQ.isError) return null;

  return (
    <motion.section variants={fadeUp}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold">User guides</h2>
          <p className="mt-0.5 text-xs text-foreground/55">
            Step-by-step guides for every part of NUSI. Open one, print it or share it with your team.
          </p>
        </div>
        {data && (
          <a
            href={`/guides/${data.complete.file}`}
            download
            className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--brand-blue))] px-4 py-2 text-sm font-bold text-white shadow-sm hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            Complete guide · {data.complete.pages} pages
          </a>
        )}
      </div>
      {guidesQ.isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-foreground/55">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading guides…
        </div>
      ) : data && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.guides.map((g) => (
            <div key={g.slug} className="group flex gap-3 rounded-2xl border border-foreground/[0.06] bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-[hsl(var(--brand-blue))]/10 text-[13px] font-extrabold text-[hsl(var(--brand-blue))]">
                {g.no}
              </span>
              <div className="min-w-0 flex-1">
                <a href={`/guides/${g.file}`} target="_blank" rel="noreferrer" className="block text-[13.5px] font-bold leading-snug hover:text-[hsl(var(--brand-blue))]">
                  {g.title}
                </a>
                <p className="mt-0.5 line-clamp-2 text-[11.5px] text-foreground/55">{g.tagline}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  <span className="inline-flex items-center gap-1 text-foreground/45">
                    <FileText className="h-3 w-3" /> PDF · {g.pages} page{g.pages === 1 ? '' : 's'}
                  </span>
                  <a href={`/guides/${g.file}`} target="_blank" rel="noreferrer" className="font-bold text-[hsl(var(--brand-blue))]">Open</a>
                  <a href={`/guides/${g.file}`} download className="inline-flex items-center gap-0.5 font-bold text-foreground/60 hover:text-foreground">
                    <Download className="h-3 w-3" /> Download
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.section>
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
