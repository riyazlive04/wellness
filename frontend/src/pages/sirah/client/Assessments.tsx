import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CheckSquare, ClipboardList, AlertCircle, Brain, Moon, Apple, Loader2, X, Check, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { Glass, fadeUp, stagger } from '@/design-system';
import { Sheet } from '@/components/Sheet';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type AssessmentCard, type AssessmentCardType } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Assessment cards — the nutritionist sends a structured form
 * (sleep questionnaire, stress check-in, etc) which the client fills in.
 * The legacy Sheizen used pending_review_cards with a JSONB blob for both
 * the form definition AND the responses. We honour that shape — no schema
 * changes needed — and patch generated_content.client_responses with the
 * submission.
 *
 * The form structure inside generated_content is loosely-typed in legacy.
 * We render whatever we find: title + sections of questions, each with
 * an `id`, `question`, `type` (text|scale|choice|multi), and optional `options`.
 * If the card doesn't have a `questions` array, we treat it as read-only.
 */

// `label` holds a clientAssessments i18n key (under `cardTypes`); resolve it
// with t() at each render site.
const CARD_META: Record<AssessmentCardType, { label: string; icon: typeof CheckSquare; tone: string }> = {
  health_assessment: { label: 'cardTypes.health_assessment', icon: ClipboardList, tone: 'text-blue-600 dark:text-blue-300' },
  stress_card:       { label: 'cardTypes.stress_card',       icon: Brain,         tone: 'text-rose-600 dark:text-rose-300' },
  sleep_card:        { label: 'cardTypes.sleep_card',        icon: Moon,          tone: 'text-teal-600 dark:text-teal-300' },
  action_plan:       { label: 'cardTypes.action_plan',       icon: CheckSquare,   tone: 'text-emerald-600 dark:text-emerald-300' },
  diet_plan:         { label: 'cardTypes.diet_plan',         icon: Apple,         tone: 'text-amber-600 dark:text-amber-300' },
  custom_form:       { label: 'cardTypes.custom_form',       icon: ClipboardList, tone: 'text-teal-600 dark:text-teal-300' },
};

export default function ClientAssessments() {
  const { t } = useTranslation('clientAssessments');
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const cardsQ = useQuery({
    queryKey: ['me', 'assessments'],
    queryFn: () => clientsApi.myAssessments(),
    retry: 1,
  });
  const [opened, setOpened] = useState<AssessmentCard | null>(null);

  const cards = cardsQ.data ?? [];
  const pending  = cards.filter((c) => !c.has_responses);
  const finished = cards.filter((c) =>  c.has_responses);

  const stats: Array<{ label: string; value: number; icon: typeof CheckSquare; tint: string }> = [
    { label: t('stats.available'), value: cards.length, icon: ClipboardList, tint: 'text-blue-600 dark:text-blue-300' },
    { label: t('stats.waiting'), value: pending.length, icon: AlertCircle, tint: 'text-amber-600 dark:text-amber-300' },
    { label: t('common:status.completed'), value: finished.length, icon: CheckSquare, tint: 'text-emerald-600 dark:text-emerald-300' },
  ];

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">

          {/* Header */}
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-300">
              <ClipboardList className="h-4 w-4" />
              <span className="text-xs uppercase tracking-[0.18em]">{t('header.eyebrow')}</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{t('header.title')}</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-foreground/60">
              {t('header.subtitle')}
            </p>
          </motion.div>

          {/* Stat strip */}
          {cards.length > 0 && (
            <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
              {stats.map((s) => (
                <Glass key={s.label} className="p-4">
                  <div className="flex items-center gap-2">
                    <s.icon className={cn('h-3.5 w-3.5', s.tint)} strokeWidth={1.8} />
                    <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{s.label}</span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</div>
                </Glass>
              ))}
            </motion.div>
          )}

          {cardsQ.isLoading ? (
            <motion.div variants={fadeUp}>
              <Glass className="flex items-center justify-center p-16 text-sm text-foreground/55">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('common:status.loading')}
              </Glass>
            </motion.div>
          ) : cards.length === 0 ? (
            <motion.div variants={fadeUp}>
              <Glass className="flex flex-col items-center gap-3 p-16 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div className="mt-1 text-sm font-medium text-foreground/80">{t('empty.title')}</div>
                <div className="max-w-sm text-xs text-foreground/55">
                  {t('empty.description')}
                </div>
              </Glass>
            </motion.div>
          ) : (
            <>
              {/* Waiting for you */}
              <motion.div variants={fadeUp} className="space-y-3">
                <h2 className="inline-flex items-center gap-2 text-base font-semibold">
                  <AlertCircle className="h-4 w-4 text-amber-500" /> {t('sections.waiting')}
                  {pending.length > 0 && (
                    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-200">
                      {pending.length}
                    </span>
                  )}
                </h2>
                {pending.length === 0 ? (
                  <Glass className="flex flex-col items-center gap-2 p-10 text-center">
                    <Check className="h-7 w-7 text-emerald-500" />
                    <div className="text-sm text-foreground/70">{t('sections.allCaughtUp.title')}</div>
                    <div className="text-xs text-foreground/50">{t('sections.allCaughtUp.description')}</div>
                  </Glass>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {pending.map((c) => (
                      <CardTile key={c.id} card={c} onOpen={() => setOpened(c)} />
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Completed */}
              {finished.length > 0 && (
                <motion.div variants={fadeUp} className="space-y-3">
                  <h2 className="inline-flex items-center gap-2 text-base font-semibold">
                    <CheckSquare className="h-4 w-4 text-emerald-500" /> {t('common:status.completed')}
                    <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-200">
                      {finished.length}
                    </span>
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {finished.map((c) => (
                      <CardTile key={c.id} card={c} onOpen={() => setOpened(c)} done />
                    ))}
                  </div>
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </div>

      {opened && <ResponderDialog card={opened} onClose={() => setOpened(null)} />}
    </ClientLayout>
  );
}

function CardTile({ card, onOpen, done }: { card: AssessmentCard; onOpen: () => void; done?: boolean }) {
  const { t } = useTranslation('clientAssessments');
  const meta = CARD_META[card.card_type] ?? CARD_META.health_assessment;
  const Icon = meta.icon;
  const title = extractTitle(card) ?? t(meta.label);
  const sent = card.sent_at ?? card.created_at;
  const sentLabel = sent
    ? new Date(sent).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '-';
  const reviewed = !!(card.generated_content as { review?: { reviewed_at?: string } })?.review?.reviewed_at;

  return (
    <Glass className="group flex h-full flex-col gap-4 p-5 transition-all hover:-translate-y-px hover:bg-foreground/[0.03]">
      <div className="flex items-start gap-3">
        <div className={cn('grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-foreground/[0.04]', meta.tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/50">{t(meta.label)}</div>
          <div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug">{title}</div>
        </div>
        {done ? (
          reviewed ? (
            <span className="flex-shrink-0 rounded-full bg-teal-500/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-200">
              {t('card.badgeReviewed')}
            </span>
          ) : (
            <span className="flex-shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
              {t('common:actions.done')}
            </span>
          )
        ) : (
          <span className="flex-shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
            {t('card.badgeNew')}
          </span>
        )}
      </div>

      {reviewed && (
        <div className="flex items-center gap-1.5 rounded-lg bg-teal-500/[0.08] px-2.5 py-1.5 text-[11px] font-medium text-teal-700 dark:text-teal-300">
          <Check className="h-3 w-3" /> {t('card.reviewedNote')}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-foreground/[0.06] pt-3">
        <span className="text-[11px] text-foreground/55">{t('card.sent', { date: sentLabel })}</span>
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            'inline-flex items-center justify-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-medium transition-transform group-hover:scale-[1.02] cta-glow',
            done
              ? 'border border-foreground/15 text-foreground/85 hover:bg-foreground/[0.04]'
              : 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.55)]',
          )}
        >
          {done ? t('card.viewAnswers') : t('card.start')}
        </button>
      </div>
    </Glass>
  );
}

interface Question {
  id: string;
  question: string;
  type?: 'section' | 'text' | 'scale' | 'number' | 'yesno' | 'choice' | 'multi' | 'table';
  options?: string[];
  max?: number;
  required?: boolean;
  /** 12-column grid span for layout (defaults to full width). */
  w?: number;
  /** `table` only — fixed, read-only row labels down the first column. */
  rows?: string[];
  /** `table` only — editable column headers. */
  columns?: string[];
}

/** A `table` answer: { [rowLabel]: { [columnHeader]: value } }. */
type TableAnswer = Record<string, Record<string, string>>;

/** True when a table answer has no non-empty cell anywhere. */
function isTableBlank(v: unknown): boolean {
  if (!v || typeof v !== 'object') return true;
  return !Object.values(v as TableAnswer).some(
    (row) => row && typeof row === 'object' && Object.values(row).some((cell) => String(cell ?? '').trim() !== ''),
  );
}

function ResponderDialog({ card, onClose }: { card: AssessmentCard; onClose: () => void }) {
  const queryClient = useQueryClient();
  const meta = CARD_META[card.card_type] ?? CARD_META.health_assessment;
  const brandQ = useQuery({ queryKey: ['me', 'nutritionist'], queryFn: () => clientsApi.myNutritionist(), staleTime: 300_000 });
  const brand = brandQ.data;

  const { title, intro, questions } = useMemo(() => parseCard(card), [card]);
  const existing = useMemo<Record<string, unknown>>(() => {
    const r = (card.generated_content as { client_responses?: Record<string, unknown> })?.client_responses;
    return r && typeof r === 'object' ? r : {};
  }, [card]);

  const [answers, setAnswers] = useState<Record<string, unknown>>(existing);

  const submitMut = useMutation({
    mutationFn: () => clientsApi.submitAssessment(card.id, answers),
    onSuccess: () => {
      toast.success('Answers saved.');
      queryClient.invalidateQueries({ queryKey: ['me', 'assessments'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save.'),
  });

  return (
    <Sheet onClose={onClose} className="sm:max-w-xl" ariaLabel={title}>
        <header className="flex items-start justify-between border-b border-foreground/[0.06] px-5 py-3">
          <div className="flex items-center gap-2.5">
            {brand && (
              brand.logo_url ? (
                <img src={brand.logo_url} alt="" className="h-9 w-9 flex-shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-xs font-bold text-white">
                  {(brand.name?.trim()?.[0] ?? 'S').toUpperCase()}
                </span>
              )
            )}
            <div className="min-w-0">
              {brand?.name && <div className="truncate text-[11px] font-bold text-foreground/60">{brand.name}</div>}
              <div className={cn('text-[10px] uppercase tracking-[0.18em]', meta.tone)}>{meta.label}</div>
              <div className="text-base font-semibold">{title}</div>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]"
            aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {(() => {
            const review = (card.generated_content as { review?: { note?: string | null; reviewed_at?: string } })?.review;
            if (!review?.reviewed_at) return null;
            return (
              <div className="rounded-xl border border-teal-400/30 bg-teal-500/[0.07] p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">
                  <Check className="h-3.5 w-3.5" /> Reviewed by your nutritionist
                </div>
                {review.note
                  ? <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{review.note}</p>
                  : <p className="mt-1.5 text-sm text-foreground/55">Your nutritionist has reviewed your answers.</p>}
              </div>
            );
          })()}

          {intro && (
            <p className="rounded-xl bg-foreground/[0.03] p-3 text-xs text-foreground/75">{intro}</p>
          )}

          {(() => {
            const report = (card.generated_content as { report?: { score?: number | null; band?: string | null } })?.report;
            if (!report || report.score == null) return null;
            return (
              <div className="flex items-center gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-3">
                <div
                  className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full"
                  style={{ background: `conic-gradient(rgb(14 154 168) ${report.score * 3.6}deg, rgba(14,154,168,0.14) 0)` }}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-popover text-sm font-semibold tabular-nums">{report.score}</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{report.band}</div>
                  <div className="text-[11px] text-foreground/55">Wellness score from your answers</div>
                </div>
              </div>
            );
          })()}

          {questions.length === 0 ? (
            // No form — this is a read-only card. Render the generated_content as-is.
            <pre className="whitespace-pre-wrap rounded-xl bg-foreground/[0.03] p-3 text-xs text-foreground/85">
              {JSON.stringify(card.generated_content, null, 2)}
            </pre>
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-12">
              {questions.map((q) => {
                const span = q.type === 'section' ? 12 : Math.min(12, Math.max(1, q.w ?? 12));
                return (
                  <div key={q.id} style={{ gridColumn: `span ${span} / span ${span}` }}>
                    <QuestionField
                      q={q}
                      value={answers[q.id]}
                      onChange={(v) => setAnswers((s) => ({ ...s, [q.id]: v }))}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {questions.length > 0 && (
          <footer className="flex items-center justify-between gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3">
            <div className="text-[11px] text-foreground/55">
              {card.has_responses ? 'Updating saved answers.' : 'Your nutritionist will see this.'}
            </div>
            <button
              type="button"
              onClick={() => {
                const isBlank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
                const missing = questions.filter((qq) => {
                  if (qq.type === 'section' || !qq.required) return false;
                  // A table's value is an object, so isBlank() would call every
                  // partially-filled OR entirely-empty grid "answered".
                  return qq.type === 'table' ? isTableBlank(answers[qq.id]) : isBlank(answers[qq.id]);
                });
                if (missing.length) { toast.error(`Please answer the required question: “${missing[0].question}”.`); return; }
                submitMut.mutate();
              }}
              disabled={submitMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {card.has_responses ? 'Update' : 'Submit'}
            </button>
          </footer>
        )}
    </Sheet>
  );
}

function QuestionField({ q, value, onChange }: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const inputCls = 'w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none';

  // A section header groups the fields below it — not an answerable question.
  if (q.type === 'section') {
    return (
      <div className="flex items-center gap-3 pt-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">{q.question}</div>
        <div className="h-px flex-1 bg-foreground/[0.10]" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 text-sm font-medium text-foreground/90">{q.question}{q.required && <span className="text-rose-500"> *</span>}</div>
      {q.type === 'scale' ? (
        <div className="flex flex-wrap items-center gap-1">
          {Array.from({ length: Math.max(2, q.max ?? 5) }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={cn(
                'h-9 w-9 rounded-full text-sm font-medium transition-colors',
                value === n
                  ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white'
                  : 'border border-foreground/15 text-foreground/65 hover:bg-foreground/[0.05]',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      ) : q.type === 'yesno' ? (
        <div className="flex gap-2">
          {['Yes', 'No'].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                'flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                value === opt
                  ? 'border-teal-400/60 bg-teal-400/10'
                  : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : q.type === 'number' ? (
        <input
          type="number"
          value={typeof value === 'number' || typeof value === 'string' ? String(value) : ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputCls}
          placeholder="Enter a number…"
        />
      ) : q.type === 'choice' && q.options?.length ? (
        <div className="space-y-1.5">
          {q.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                'w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                value === opt
                  ? 'border-teal-400/60 bg-teal-400/10'
                  : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : q.type === 'multi' && q.options?.length ? (
        <div className="space-y-1.5">
          {q.options.map((opt) => {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            const on = arr.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(on ? arr.filter((x) => x !== opt) : [...arr, opt])}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                  on
                    ? 'border-teal-400/60 bg-teal-400/10'
                    : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
                )}
              >
                <span className={cn(
                  'grid h-4 w-4 place-items-center rounded border',
                  on ? 'border-teal-400 bg-teal-500 text-white' : 'border-foreground/30',
                )}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      ) : q.type === 'table' && q.rows?.length ? (
        <TableField q={q} value={value} onChange={onChange} />
      ) : (
        // Default: free-text textarea (multi-line for richer responses).
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          maxLength={1500}
          className={cn(inputCls, 'resize-none')}
          placeholder="Type your answer…"
        />
      )}
    </div>
  );
}

/**
 * A fixed-row grid (e.g. a lab panel): read-only row labels down the side,
 * editable columns across. Cells are keyed by the visible labels rather than by
 * index, so editing the template later — inserting or reordering a row — never
 * silently re-maps answers a client already submitted.
 *
 * Two layouts over the same data: a real table from `sm` up, and one card per
 * row on phones. A 4-column clinical table is unusable at 375px, and this is a
 * mobile-first portal.
 */
function TableField({ q, value, onChange }: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const rows = q.rows ?? [];
  const cols = q.columns?.length ? q.columns : ['Value'];
  const data = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as TableAnswer;

  const cell = (row: string, col: string) => data[row]?.[col] ?? '';
  const setCell = (row: string, col: string, v: string) =>
    onChange({ ...data, [row]: { ...(data[row] ?? {}), [col]: v } });

  const cellCls = 'w-full rounded-lg border border-foreground/10 bg-background px-2.5 py-1.5 text-sm focus:border-teal-400/60 focus:outline-none';
  const headCls = 'border border-foreground/10 bg-foreground/[0.04] px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-foreground/60';

  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {/* The source form leaves the row-label column unheaded. */}
              <th className={headCls} />
              {cols.map((c) => <th key={c} className={headCls}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <td className="border border-foreground/10 px-2.5 py-1.5 text-[13px] font-medium text-foreground/80">{r}</td>
                {cols.map((c) => (
                  <td key={c} className="border border-foreground/10 p-1">
                    <input
                      value={cell(r, c)}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      maxLength={120}
                      className={cellCls}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2.5 sm:hidden">
        {rows.map((r) => (
          <div key={r} className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
            <div className="mb-2 text-[13px] font-semibold text-foreground/85">{r}</div>
            <div className="space-y-2">
              {cols.map((c) => (
                <label key={c} className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-wide text-foreground/50">{c}</span>
                  <input
                    value={cell(r, c)}
                    onChange={(e) => setCell(r, c, e.target.value)}
                    maxLength={120}
                    className={cellCls}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────

interface ParsedCard {
  title: string | null;
  intro: string | null;
  questions: Question[];
}

/**
 * Parse the loosely-typed generated_content blob. Legacy Sheizen produced
 * many shapes; we accept any of:
 *   { title, intro, questions: [{ id, question, type, options }] }
 *   { name, summary, fields: [...] }   (legacy alt)
 *   bare text                          (no form to fill in)
 */
function parseCard(card: AssessmentCard): ParsedCard {
  const c = card.generated_content as Record<string, unknown>;
  if (!c || typeof c !== 'object') return { title: null, intro: null, questions: [] };

  const title  = (c.title ?? c.name ?? null) as string | null;
  const intro  = (c.intro ?? c.summary ?? c.description ?? null) as string | null;

  let rawQs: unknown =
    (c.questions as unknown) ??
    (c.fields as unknown) ??
    (c.form as unknown) ??
    [];
  if (!Array.isArray(rawQs)) rawQs = [];

  const questions: Question[] = (rawQs as unknown[]).flatMap((item, i) => {
    if (!item || typeof item !== 'object') return [];
    const o = item as Record<string, unknown>;
    const qtext = (o.question ?? o.label ?? o.prompt) as string | undefined;
    if (!qtext || typeof qtext !== 'string') return [];
    const id = (o.id ?? o.key ?? `q${i}`) as string;
    const t = (o.type ?? o.kind) as Question['type'] | undefined;
    const options = Array.isArray(o.options) ? (o.options as string[]).filter((x) => typeof x === 'string') : undefined;
    const max = typeof o.max === 'number' ? o.max : undefined;
    const required = o.required === true;
    const w = typeof o.w === 'number' ? Math.min(12, Math.max(1, Math.round(o.w))) : undefined;
    const strArr = (x: unknown) =>
      Array.isArray(x) ? (x as unknown[]).filter((s): s is string => typeof s === 'string') : undefined;
    return [{ id, question: qtext, type: t, options, max, required, w, rows: strArr(o.rows), columns: strArr(o.columns) }];
  });

  return { title, intro, questions };
}

function extractTitle(card: AssessmentCard): string | null {
  const c = card.generated_content as Record<string, unknown>;
  if (!c || typeof c !== 'object') return null;
  return (c.title ?? c.name ?? null) as string | null;
}