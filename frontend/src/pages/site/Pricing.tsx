import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Rule, Section, SiteLayout } from '@/modules/site/SiteLayout';

interface PublicPlan {
  key: string;
  name: string;
  tagline: string;
  priceInr: number;
  priceInrAnnual: number | null;
  setupFeeInr: number | null;
  setupIncludes: string[];
  features: string[];
  recommended: boolean;
  maxClients: number | null;
  maxTeam: number | null;
  aiCreditsPerMonth: number | null;
  storageGb: number | null;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const FAQ = [
  ['Is there a free trial?',
   'Yes — 14 days, and we do not ask for a card to start. You can use the whole product with your own clients in that time.'],
  ['What is the setup fee for?',
   'It is one payment when you join, charged with your first invoice: we set up your account and branding, import your existing clients, and train you on it. ₹4,999 on Starter, ₹9,999 on Growth, ₹24,999 on Scale Pro. It is never charged twice, and moving up a plan only charges the difference.'],
  ['Can I change plan later?',
   'Yes, up or down, whenever. Moving up charges only the difference in the setup fee, not the whole amount again.'],
  ['What happens if I go over my client limit?',
   'Nothing breaks and nothing is charged automatically. You will be asked to move up a plan when you want to add more.'],
  ['Do prices include GST?',
   'Yes. The price you see is the price charged — 18% GST is already in it.'],
  ['Can I cancel?',
   'Any time, from your billing page. You keep access until the end of the month you have paid for. See our refund policy for the first-payment refund window.'],
] as const;

/**
 * Public pricing. Reads the live catalogue from /public/plans so the page can
 * never drift from what is actually charged — the one thing on a pricing page
 * that must not be a stale copy.
 */
export default function SitePricing() {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const q = useQuery({
    queryKey: ['public', 'plans'],
    queryFn: () => api.get<{ plans: PublicPlan[] }>('/api/v1/public/plans', { skipAuth: true }),
    staleTime: 10 * 60_000,
  });

  const plans = q.data?.plans ?? [];

  return (
    <SiteLayout
      title="Pricing — NUSI"
      description="NUSI plans from ₹3,999 a month, GST included, with 14 days free. Starter, Growth and Scale Pro for nutrition practices in India."
    >
      <Section className="pb-10 pt-20 sm:pt-24">
        <h1 className="max-w-[24ch] text-[32px] font-normal leading-[1.12] tracking-[-0.035em] sm:text-[40px]">
          One subscription. Your whole practice.
        </h1>
        <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-[#6b6b6b]">
          Every plan starts with 14 days free, and no card to begin. Prices include GST.
        </p>

        <div className="mt-8 inline-flex rounded-lg border border-[#ededea] p-0.5">
          {(['monthly', 'annual'] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCycle(c)}
              className={cn('rounded-[6px] px-4 py-1.5 text-sm font-medium transition-colors',
                cycle === c ? 'bg-[#0c0c0c] text-white' : 'text-[#6b6b6b] hover:text-[#0c0c0c]')}>
              {c === 'monthly' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
      </Section>

      <Section className="pb-16">
        {q.isLoading ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-5 w-5 animate-spin text-[#9b9b9b]" /></div>
        ) : q.isError ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[#ededea] px-5 py-6 text-sm">
            <span>Couldn’t load prices just now.</span>
            <button type="button" onClick={() => void q.refetch()}
              className="rounded-lg border border-[#d9d9d6] px-3 py-1.5 text-sm font-medium">Try again</button>
          </div>
        ) : (
          <div className="grid gap-px overflow-hidden rounded-xl border border-[#ededea] bg-[#ededea] sm:grid-cols-3">
            {plans.map((p) => {
              const annual = cycle === 'annual' && p.priceInrAnnual;
              const price = annual ? p.priceInrAnnual! : p.priceInr;
              const saving = p.priceInrAnnual ? p.priceInr * 12 - p.priceInrAnnual : 0;
              return (
                <div key={p.key} className="flex flex-col bg-white p-6">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-[15px] font-medium">{p.name}</h2>
                    {p.recommended && (
                      <span className="text-[11px] uppercase tracking-[0.1em] text-[#1a4d2e]">Most chosen</span>
                    )}
                  </div>
                  <p className="mt-1 text-[13.5px] text-[#9b9b9b]">{p.tagline}</p>

                  <div className="mt-5">
                    <span className="text-[30px] font-normal tracking-[-0.035em]">{inr(price)}</span>
                    <span className="text-sm text-[#9b9b9b]">{annual ? '/year' : '/month'}</span>
                  </div>
                  {annual && saving > 0 && (
                    <p className="mt-1 text-[13px] text-[#1a4d2e]">Saves {inr(saving)} a year</p>
                  )}
                  {p.setupFeeInr ? (
                    <p className="mt-1 text-[13px] text-[#9b9b9b]">
                      Plus a one-time {inr(p.setupFeeInr)} setup fee
                    </p>
                  ) : null}

                  <ul className="mt-6 grid gap-2 text-[14px] text-[#6b6b6b]">
                    {[
                      p.maxClients === null ? 'Unlimited clients' : `${p.maxClients} clients`,
                      p.maxTeam === null ? 'Unlimited team members' : `${p.maxTeam} team member${p.maxTeam === 1 ? '' : 's'}`,
                      p.aiCreditsPerMonth ? `${p.aiCreditsPerMonth.toLocaleString('en-IN')} AI actions a month` : null,
                      p.storageGb ? `${p.storageGb} GB storage` : null,
                    ].filter(Boolean).map((line) => <li key={String(line)}>{line}</li>)}
                  </ul>

                  <ul className="mt-4 grid gap-1.5 border-t border-[#ededea] pt-4 text-[13.5px] text-[#6b6b6b]">
                    {p.features.slice(0, 6).map((f) => <li key={f}>{f}</li>)}
                  </ul>

                  <Link to="/auth?mode=signup"
                    className={cn('mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-85',
                      p.recommended ? 'bg-[#0c0c0c] text-white' : 'border border-[#d9d9d6] text-[#0c0c0c]')}>
                    Start free trial
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-6 max-w-[62ch] text-[13.5px] leading-relaxed text-[#9b9b9b]">
          The setup fee covers account setup, your branding, importing your existing clients and training.
          It is charged once, with your first invoice — never again, and moving up a plan charges only the difference.
        </p>
      </Section>

      <Rule />

      <Section className="py-14">
        <h2 className="text-[22px] font-normal tracking-[-0.02em]">Questions</h2>
        <div className="mt-6">
          {FAQ.map(([q_, a]) => (
            <details key={q_} className="group border-t border-[#ededea] py-5">
              <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 text-[16px] font-medium">
                {q_}
                <span className="text-[#9b9b9b] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-[70ch] text-[14.5px] leading-relaxed text-[#6b6b6b]">{a}</p>
            </details>
          ))}
          <div className="border-t border-[#ededea]" />
        </div>
      </Section>

      <Rule />

      <Section className="py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-[36ch] text-[22px] font-normal leading-snug tracking-[-0.02em]">
            Still deciding? Book a walkthrough and we will show you.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/booking-page"
              className="rounded-lg bg-[#0c0c0c] px-6 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-85">
              Book a demo
            </Link>
            <Link to="/auth?mode=signup" className="text-sm text-[#6b6b6b] underline-offset-4 hover:underline">
              Or start the free trial
            </Link>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}
