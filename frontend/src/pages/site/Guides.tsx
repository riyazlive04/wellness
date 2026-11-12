/**
 * Search landing pages.
 *
 * Nobody searches "NUSI" — the site had nine pages, four of them legal, and
 * was getting about eight clicks a week. Google ranks ONE page per intent, so
 * adding keywords to /features could never work: a feature list cannot also be
 * the answer to "how do I write diet charts faster".
 *
 * Each entry below is one page answering one search. They share this component
 * because they differ only in copy — a second hand-built page per keyword
 * would be six near-identical files to keep in step.
 *
 * Every claim here must be true of the product. The copy is drawn from
 * /features and /pricing rather than invented; if a plan limit or a feature
 * changes, fix it there and here together.
 *
 * Adding a page means THREE edits, or it will not be indexed:
 *   1. an entry in GUIDES below
 *   2. a <Route> in App.tsx
 *   3. an entry in scripts/prerender.mjs (the crawlable HTML + sitemap)
 */
import { Link, useParams } from 'react-router-dom';

import { Rule, Section, SiteLayout } from '@/modules/site/SiteLayout';

// Same copy the prerenderer writes into the crawlable HTML - see guides.data.mjs.
import { GUIDES as RAW_GUIDES } from './guides.data.mjs';

export type Guide = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  sections: Array<{ heading: string; body: string[] }>;
  /** Shown at the end — the question someone still has after reading. */
  faq: Array<{ q: string; a: string }>;
};

export const GUIDES: Guide[] = RAW_GUIDES;

export const GUIDE_BY_SLUG = Object.fromEntries(GUIDES.map((g) => [g.slug, g]));

export default function GuidePage() {
  const { slug } = useParams();
  const guide = slug ? GUIDE_BY_SLUG[slug] : undefined;

  // An unknown slug must not render a blank indexable page: say so plainly and
  // send the reader somewhere real.
  if (!guide) {
    return (
      <SiteLayout title="Not found — NUSI" description="This page does not exist.">
        <Section className="py-20">
          <h1 className="text-[34px] tracking-[-0.02em]">Page not found</h1>
          <p className="mt-4 max-w-[60ch] text-[15.5px] leading-relaxed text-[#6b6b6b]">
            That page does not exist. The{' '}
            <Link to="/features" className="underline underline-offset-4">product pages</Link> and{' '}
            <Link to="/pricing" className="underline underline-offset-4">pricing</Link> are a good place to start.
          </p>
        </Section>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout title={guide.title} description={guide.description}>
      <Section className="py-16 sm:py-20">
        <h1 className="max-w-[20ch] text-[34px] leading-[1.1] tracking-[-0.02em] sm:text-[44px]">{guide.h1}</h1>
        <p className="mt-6 max-w-[62ch] text-[17px] leading-relaxed text-[#6b6b6b]">{guide.intro}</p>
      </Section>

      <Rule />

      {guide.sections.map((s) => (
        <div key={s.heading}>
          <Section className="py-12">
            <div className="grid gap-8 sm:grid-cols-[200px_1fr]">
              <h2 className="text-sm uppercase tracking-[0.1em] text-[#9b9b9b]">{s.heading}</h2>
              <div className="grid max-w-[64ch] gap-4 text-[15.5px] leading-relaxed text-[#6b6b6b]">
                {s.body.map((p) => <p key={p}>{p}</p>)}
              </div>
            </div>
          </Section>
          <Rule />
        </div>
      ))}

      <Section className="py-12">
        <div className="grid gap-8 sm:grid-cols-[200px_1fr]">
          <h2 className="text-sm uppercase tracking-[0.1em] text-[#9b9b9b]">Questions</h2>
          <dl className="grid max-w-[64ch] gap-6">
            {guide.faq.map((f) => (
              <div key={f.q}>
                <dt className="text-[15.5px] font-medium text-[#0c0c0c]">{f.q}</dt>
                <dd className="mt-1.5 text-[15.5px] leading-relaxed text-[#6b6b6b]">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Rule />

      <Section className="py-16">
        <h2 className="text-[26px] tracking-[-0.02em] sm:text-[30px]">See it on your own practice.</h2>
        <p className="mt-4 max-w-[60ch] text-[15.5px] leading-relaxed text-[#6b6b6b]">
          Fourteen days free, no card to begin. Or book a walkthrough and we will show you
          how it fits what you already do.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/booking-page"
            className="rounded-full bg-[#0c0c0c] px-6 py-3 text-sm text-white transition-opacity hover:opacity-85">
            Book a demo
          </Link>
          <Link to="/pricing"
            className="rounded-full border border-[#dcdcd8] px-6 py-3 text-sm text-[#0c0c0c] transition-colors hover:bg-[#fafaf9]">
            See pricing
          </Link>
        </div>
      </Section>
    </SiteLayout>
  );
}
