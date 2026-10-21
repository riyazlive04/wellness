import { useEffect, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { cn } from '@/lib/utils';

/** Everything the footer links to, in one place. */
/**
 * Every public marketing path. Exported so the route table and the route-
 * warming guard in App.tsx read from one list: when these moved off `/`, the
 * guard still only knew about `/`, so a visitor reading /pricing had the whole
 * owner app (76 chunks, including charts and PDF libraries) warmed behind the
 * page.
 */
export const SITE_PATHS = [
  '/home', '/features', '/pricing', '/about', '/contact',
  '/terms', '/privacy', '/refunds', '/booking-page',
] as const;

export const SITE_NAV = [
  { to: '/features', label: 'Product' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
] as const;

const LEGAL = [
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/refunds', label: 'Refunds' },
  { to: '/contact', label: 'Contact' },
] as const;

/**
 * The marketing site's shell: a thin header, the page, and a footer.
 *
 * Deliberately plain — one accent colour, light type, hairline rules and a
 * lot of space. The app is dark by default, so these pages force light and
 * put the visitor's preference back when they leave.
 */
export function SiteLayout({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  useForceLight();
  useDocumentHead(title, description);

  return (
    <div className="min-h-screen bg-white text-[#0c0c0c]">
      <header className="sticky top-0 z-40 border-b border-[#ededea] bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          {/* /home, not /: the root is the booking funnel. */}
          <Link to="/home" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.03em]">
            <img src="/nusi-mark.png" alt="" className="h-6 w-6 rounded-full" />
            NUSI
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-[#6b6b6b] sm:flex">
            {SITE_NAV.map((l) => (
              <NavLink key={l.to} to={l.to}
                className={({ isActive }) => cn('transition-colors hover:text-[#0c0c0c]', isActive && 'text-[#0c0c0c]')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden px-2 text-sm text-[#6b6b6b] transition-colors hover:text-[#0c0c0c] sm:block">
              Sign in
            </Link>
            <Link to="/booking-page"
              className="rounded-lg bg-[#436F17] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#375818]">
              Book a demo
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-[#ededea]">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.03em]">
              <img src="/nusi-mark.png" alt="" className="h-5 w-5 rounded-full" />
              NUSI
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#6b6b6b]">
              Practice software for nutritionists — meal plans, a client app, daily tracking and billing.
            </p>
          </div>
          <nav className="grid content-start gap-2.5 text-sm">
            <span className="text-xs uppercase tracking-[0.1em] text-[#9b9b9b]">Product</span>
            {SITE_NAV.map((l) => (
              <Link key={l.to} to={l.to} className="text-[#6b6b6b] transition-colors hover:text-[#0c0c0c]">{l.label}</Link>
            ))}
            <Link to="/booking-page" className="text-[#6b6b6b] transition-colors hover:text-[#0c0c0c]">Book a demo</Link>
          </nav>
          <nav className="grid content-start gap-2.5 text-sm">
            <span className="text-xs uppercase tracking-[0.1em] text-[#9b9b9b]">Legal</span>
            {LEGAL.map((l) => (
              <Link key={l.to} to={l.to} className="text-[#6b6b6b] transition-colors hover:text-[#0c0c0c]">{l.label}</Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-[#ededea]">
          <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-3 px-6 py-5 text-xs text-[#9b9b9b]">
            <span>© {new Date().getFullYear()} Sirah Digital. All rights reserved.</span>
            <span>Chennai, Tamil Nadu · support@sirahdigital.in</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** A page's title and meta description, for search results and shares. */
function useDocumentHead(title: string, description: string) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', description);
    return () => {
      document.title = prevTitle;
      if (prevDesc !== null) meta?.setAttribute('content', prevDesc);
    };
  }, [title, description]);
}

/**
 * The app defaults to dark; these pages are designed light. Force it while a
 * marketing page is open and restore the visitor's choice on the way out.
 */
function useForceLight() {
  useEffect(() => {
    const root = document.documentElement;
    const had = { light: root.classList.contains('light'), dark: root.classList.contains('dark') };
    root.classList.add('light');
    root.classList.remove('dark');
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const prevColor = themeMeta?.getAttribute('content') ?? null;
    themeMeta?.setAttribute('content', '#ffffff');
    return () => {
      root.classList.toggle('light', had.light);
      root.classList.toggle('dark', had.dark);
      if (prevColor !== null) themeMeta?.setAttribute('content', prevColor);
    };
  }, []);
}

/** Shared page furniture, so each page stays mostly content. */
export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('mx-auto max-w-5xl px-6', className)}>{children}</section>;
}

export function Rule() {
  return <div className="h-px bg-[#ededea]" />;
}

/** The index row that gives the homepage its character: label, note, arrow. */
export function IndexRow({ to, label, note }: { to: string; label: string; note: string }) {
  return (
    <Link to={to}
      className="group flex items-baseline justify-between gap-6 border-t border-[#ededea] py-7 transition-colors hover:bg-[#fafaf9]">
      <span className="text-[26px] font-normal tracking-[-0.02em] sm:text-[30px]">{label}</span>
      <span className="flex items-baseline gap-3 text-right text-sm text-[#9b9b9b]">
        {note}
        <span className="transition-transform group-hover:translate-x-1">→</span>
      </span>
    </Link>
  );
}
