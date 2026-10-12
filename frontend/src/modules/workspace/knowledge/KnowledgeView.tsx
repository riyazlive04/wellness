import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BookOpen, ChevronDown, Download, FileText, Loader2, Search, X,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { AnswerText } from './AnswerText';
import {
  knowledgeApi,
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

/** The PDF user guides, built by scripts/user-guide and served from /guides. */
type GuideFile = {
  no: number; slug: string; section: string; color: string; title: string; tagline: string;
  file: string; thumb: string; pages: number; kb: number;
};
type CompleteGuide = { file: string; thumb: string; parts: number; pages: number; kb: number };
type GuideIndex = { complete: CompleteGuide; guides: GuideFile[] };

const fetchGuides = async (): Promise<GuideIndex> => {
  const res = await fetch('/guides/index.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Guides are not available');
  return res.json();
};

/**
 * Help & guides — search the NUSI guide, and the PDF user guide for each section.
 *
 * A search page, not a chat: it shows the passages that match, each with its
 * source, and says plainly when nothing does. Nothing is generated, so what a
 * nutritionist reads is exactly what the guide or their document says.
 */
export function HelpGuidesView() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  const docsQ = useQuery({ queryKey: ['knowledge', 'documents'], queryFn: knowledgeApi.list });
  const searchQ = useQuery({
    queryKey: ['knowledge', 'search', query],
    queryFn: () => knowledgeApi.search(query),
    enabled: query.length > 0,
    staleTime: 5 * 60_000,
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
          Search the NUSI guide, or open the step-by-step guide for any section below.
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

      <div>
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
            <UserGuides />
          )}
        </motion.div>
      </div>

    </motion.div>
  );
}

function UserGuides() {
  const guidesQ = useQuery({ queryKey: ['help', 'guides'], queryFn: fetchGuides, staleTime: 60 * 60_000 });
  const data = guidesQ.data;

  if (guidesQ.isLoading) {
    return (
      <Glass className="flex items-center gap-2 p-5 text-sm text-foreground/55">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading guides…
      </Glass>
    );
  }
  if (!data) return <Glass className="p-5 text-sm text-foreground/65">The user guides can't be loaded right now.</Glass>;

  return (
    <section>
      <CompleteGuideCard guide={data.complete} />
      <div className="mb-3 mt-8 px-1">
        <h2 className="text-lg font-extrabold tracking-tight">Guides by section</h2>
        <p className="mt-0.5 text-xs text-foreground/55">
          {data.guides.length} step-by-step guides, one for each section. Open one, print it or share it with your team.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {data.guides.map((g) => <GuideCard key={g.slug} guide={g} />)}
      </div>
    </section>
  );
}

function CompleteGuideCard({ guide: c }: { guide: CompleteGuide }) {
  const href = `/guides/${c.file}`;
  return (
    <div className="group relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1a5c2d] via-[#2f8f46] to-[#6db33f] text-white shadow-[0_24px_50px_-28px_rgba(20,80,40,0.7)]">
      <span className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/[0.08]" />
      <span className="pointer-events-none absolute -bottom-28 right-56 h-56 w-56 rounded-full bg-white/[0.06]" />
      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:p-8">
        <a href={href} target="_blank" rel="noreferrer" aria-label="Open the complete user guide" className="relative mx-auto h-56 w-40 flex-shrink-0 md:mx-0">
          <span className="absolute inset-0 translate-x-4 translate-y-1 rotate-6 rounded-lg bg-white/30" />
          <span className="absolute inset-0 translate-x-2 rotate-3 rounded-lg bg-white/50" />
          <img
            src={`/guides/${c.thumb}`}
            alt=""
            className="relative h-full w-full rounded-lg object-cover object-top shadow-[0_18px_36px_-12px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:-translate-y-1 group-hover:-rotate-1"
          />
        </a>
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-full bg-white/[0.18] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]">
            NUSI overall guide
          </span>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">The complete NUSI user guide</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/85">
            All {c.parts} guides in one book, from setting up your practice and adding your first client to billing,
            with a contents page and bookmarks for every section.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-lg bg-white/15 px-2.5 py-1">{c.parts} parts</span>
            <span className="rounded-lg bg-white/15 px-2.5 py-1">{c.pages} pages</span>
            <span className="rounded-lg bg-white/15 px-2.5 py-1">PDF · {(c.kb / 1024).toFixed(1)} MB</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#1f6b34] shadow-sm hover:bg-white/90">
              <BookOpen className="h-4 w-4" /> Open guide
            </a>
            <a href={href} download className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">
              <Download className="h-4 w-4" /> Download
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideCard({ guide: g }: { guide: GuideFile }) {
  const href = `/guides/${g.file}`;
  return (
    <div className="group flex flex-col overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open the ${g.title} guide`}
        className="relative block h-44 overflow-hidden"
        style={{ background: `linear-gradient(150deg, ${g.color}33, ${g.color}0a 85%)` }}
      >
        <span className="absolute -right-6 -top-8 h-28 w-28 rounded-full opacity-20" style={{ background: g.color }} />
        <span
          className="absolute left-3 top-3 z-10 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold shadow-sm"
          style={{ color: g.color }}
        >
          {g.section}
        </span>
        <span className="absolute right-3 top-3 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] font-bold text-white">
          Part {g.no}
        </span>
        <img
          src={`/guides/${g.thumb}`}
          alt=""
          loading="lazy"
          className="absolute left-1/2 top-12 w-[74%] -translate-x-1/2 rounded-t-lg bg-white shadow-[0_14px_32px_-10px_rgba(15,40,25,0.45)] ring-1 ring-black/5 transition-transform duration-300 group-hover:-translate-y-1.5"
        />
      </a>
      <div className="flex flex-1 flex-col p-4">
        <a href={href} target="_blank" rel="noreferrer" className="text-[15px] font-extrabold leading-snug hover:text-[hsl(var(--brand-blue))]">
          {g.title}
        </a>
        <p className="mt-1 line-clamp-2 text-xs text-foreground/60">{g.tagline}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11.5px]">
          <span className="inline-flex items-center gap-1 text-foreground/45">
            <FileText className="h-3.5 w-3.5" /> PDF · {g.pages} page{g.pages === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-3">
            <a href={href} target="_blank" rel="noreferrer" className="font-bold text-[hsl(var(--brand-blue))]">Open</a>
            <a href={href} download className="inline-flex items-center gap-1 font-bold text-foreground/60 hover:text-foreground">
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          </span>
        </div>
      </div>
    </div>
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
