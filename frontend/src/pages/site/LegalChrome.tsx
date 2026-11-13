/**
 * The frame around Terms, Privacy and Refunds: tabs between the three, a
 * numbered contents list that tracks what you are reading, and the heading
 * component that feeds it.
 *
 * These are long documents — Terms runs to about 870 words over eleven
 * sections — and they were a single flat column, so finding "Liability" or
 * "Refund on your first payment" meant scrolling and hoping.
 *
 * Headings REGISTER THEMSELVES rather than being listed twice. A hand-kept
 * array beside the content is the kind of thing that silently goes stale the
 * first time someone adds a section, and a contents list that disagrees with
 * the page is worse than none.
 *
 * Kept as three URLs, NOT merged into one page: Razorpay's merchant checks
 * want distinct Terms, Privacy and Refund links, nusi.in was rejected once
 * already, and Play and the App Store each want a dedicated privacy URL.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { Section, SiteLayout } from '@/modules/site/SiteLayout';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/refunds', label: 'Refunds' },
] as const;

/** Turns a heading into a stable #anchor, so links into a section survive edits. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

type Entry = { id: string; text: string };

/**
 * A section heading. It carries its own anchor id and a data attribute, and
 * the contents list is read back from those after mount — so the list cannot
 * drift from the document the way a hand-kept array beside it would.
 */
export function H({ children }: { children: ReactNode }) {
  const text = typeof children === 'string' ? children : String(children);
  return (
    <h2
      id={slug(text)}
      data-legal-heading
      className="mb-2 scroll-mt-28 text-[17px] font-medium tracking-[-0.01em] text-[#0c0c0c]"
    >
      {text}
    </h2>
  );
}

export const UL = ({ items }: { items: string[] }) => (
  <ul className="mt-2 list-disc space-y-1.5 pl-5">
    {items.map((i) => <li key={i}>{i}</li>)}
  </ul>
);

export function LegalDoc({
  title,
  description,
  updated,
  children,
}: {
  title: string;
  description: string;
  updated: string;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState('');

  // Read the headings back from the DOM after mount: that is the first moment
  // the list is complete, and it stays correct when a section is added.
  const [toc, setToc] = useState<Entry[]>([]);
  useEffect(() => {
    const nodes = body.current?.querySelectorAll<HTMLElement>('[data-legal-heading]');
    if (nodes?.length) {
      setToc([...nodes].map((n) => ({ id: n.id, text: n.textContent ?? '' })));
    }
  }, [children]);

  // Highlight the section being read. rootMargin pins the trigger line near the
  // top of the viewport, so a heading counts as "current" once it reaches the
  // reading position rather than when it first peeks into view.
  useEffect(() => {
    const nodes = body.current?.querySelectorAll<HTMLElement>('[data-legal-heading]');
    if (!nodes?.length) return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (items) => {
        for (const i of items) seen.set(i.target.id, i.isIntersecting);
        const first = [...nodes].find((n) => seen.get(n.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [toc]);

  return (
    <SiteLayout title={`${title} — NUSI`} description={description}>
      {/* Tabs. Sticky so you can move between the three documents from anywhere
          in a long one without scrolling back to the top. */}
      <div className="sticky top-0 z-20 border-b border-[#ededea] bg-[#fdfdfc]/90 backdrop-blur">
        <Section className="flex gap-1 py-3">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-4 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-[#0c0c0c] text-white'
                    : 'text-[#6b6b6b] hover:bg-[#f2f2ef] hover:text-[#0c0c0c]',
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </Section>
      </div>

      <Section className="pb-20 pt-12 sm:pt-16">
        <h1 className="text-[32px] font-normal leading-[1.12] tracking-[-0.035em] sm:text-[38px]">
          {title}
        </h1>
        <p className="mt-3 text-[14px] text-[#9b9b9b]">Last updated {updated}</p>

        <div className="mt-10 gap-12 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
          {/* Contents. Collapsible on a phone so it does not push the document
              below a fold of links; always open from lg up.

              NOT one <details> toggled by a breakpoint: <details> hides its
              content unless the `open` ATTRIBUTE is set, and no CSS class
              overrides that — the list rendered, in the DOM, invisible. */}
          <nav
            className="mb-8 hidden gap-1.5 lg:sticky lg:top-20 lg:mb-0 lg:grid"
            aria-label="Contents"
          >
            <span className="mb-1 text-xs uppercase tracking-[0.1em] text-[#9b9b9b]">Contents</span>
            {toc.map((e, i) => (
              <a
                key={e.id}
                href={`#${e.id}`}
                className={cn(
                  'flex gap-2.5 text-[13.5px] leading-snug transition-colors',
                  active === e.id ? 'text-[#0c0c0c]' : 'text-[#9b9b9b] hover:text-[#6b6b6b]',
                )}
              >
                <span className="tabular-nums text-[#c4c4bd]">{String(i + 1).padStart(2, '0')}</span>
                <span>{e.text}</span>
              </a>
            ))}
          </nav>

          <details className="mb-8 rounded-xl border border-[#ededea] p-4 lg:hidden">
            <summary className="cursor-pointer list-none text-xs uppercase tracking-[0.1em] text-[#9b9b9b]">
              Contents
            </summary>
            <nav className="mt-3 grid gap-1.5">
              {toc.map((e, i) => (
                <a
                  key={e.id}
                  href={`#${e.id}`}
                  className={cn(
                    'flex gap-2.5 text-[13.5px] leading-snug transition-colors',
                    active === e.id ? 'text-[#0c0c0c]' : 'text-[#9b9b9b] hover:text-[#6b6b6b]',
                  )}
                >
                  <span className="tabular-nums text-[#c4c4bd]">{String(i + 1).padStart(2, '0')}</span>
                  <span>{e.text}</span>
                </a>
              ))}
            </nav>
          </details>

          <div
            ref={body}
            className="max-w-[70ch] space-y-10 text-[15.5px] leading-relaxed text-[#45453f]"
          >
            {children}
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}
