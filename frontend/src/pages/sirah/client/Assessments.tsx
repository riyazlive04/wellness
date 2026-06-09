import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CheckSquare, ClipboardList, AlertCircle, Brain, Moon, Apple, Loader2, X, Check, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
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

const CARD_META: Record<AssessmentCardType, { label: string; icon: typeof CheckSquare; tone: string }> = {
  health_assessment: { label: 'Health assessment', icon: ClipboardList, tone: 'text-blue-600 dark:text-blue-300' },
  stress_card:       { label: 'Stress check-in',   icon: Brain,         tone: 'text-rose-600 dark:text-rose-300' },
  sleep_card:        { label: 'Sleep diary',       icon: Moon,          tone: 'text-violet-600 dark:text-violet-300' },
  action_plan:       { label: 'Action plan',       icon: CheckSquare,   tone: 'text-emerald-600 dark:text-emerald-300' },
  diet_plan:         { label: 'Diet plan',         icon: Apple,         tone: 'text-amber-600 dark:text-amber-300' },
};

export default function ClientAssessments() {
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

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">

        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Reviews · From your nutritionist</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Assessments.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            Short questionnaires from your nutritionist. Your answers shape the next steps in your plan.
          </p>
        </motion.div>

        {cardsQ.isLoading ? (
          <motion.div variants={fadeUp}>
            <Glass className="mt-6 flex items-center justify-center p-10 text-sm text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </Glass>
          </motion.div>
        ) : cards.length === 0 ? (
          <motion.div variants={fadeUp}>
            <Glass className="mt-6 flex flex-col items-center gap-3 p-10 text-center">
              <Sparkles className="h-7 w-7 text-foreground/35" />
              <div className="text-sm text-foreground/65">No assessments waiting. Your nutritionist hasn't sent one yet.</div>
            </Glass>
          </motion.div>
        ) : (
          <>
            {pending.length > 0 && (
              <motion.div variants={fadeUp} className="mt-6">
                <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold">
                  <AlertCircle className="h-4 w-4 text-amber-500" /> Waiting for you
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {pending.map((c) => (
                    <CardTile key={c.id} card={c} onOpen={() => setOpened(c)} />
                  ))}
                </div>
              </motion.div>
            )}
            {finished.length > 0 && (
              <motion.div variants={fadeUp} className="mt-8">
                <h2 className="mb-3 text-base font-semibold">Completed</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {finished.map((c) => (
                    <CardTile key={c.id} card={c} onOpen={() => setOpened(c)} done />
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}
      </motion.div>

      {opened && <ResponderDialog card={opened} onClose={() => setOpened(null)} />}
    </ClientLayout>
  );
}

function CardTile({ card, onOpen, done }: { card: AssessmentCard; onOpen: () => void; done?: boolean }) {
  const meta = CARD_META[card.card_type] ?? CARD_META.health_assessment;
  const Icon = meta.icon;
  const title = extractTitle(card) ?? meta.label;

  return (
    <Glass className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className={cn('grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-foreground/[0.04]', meta.tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold">{title}</div>
            {done && (
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0 text-[9px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                Done
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-foreground/55">
            Sent {card.sent_at ? new Date(card.sent_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : new Date(card.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'inline-flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium',
          done
            ? 'border border-foreground/15 text-foreground/85 hover:bg-foreground/[0.04]'
            : 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)]',
        )}
      >
        {done ? 'View answers' : 'Start'}
      </button>
    </Glass>
  );
}

interface Question {
  id: string;
  question: string;
  type?: 'text' | 'scale' | 'choice' | 'multi';
  options?: string[];
}

function ResponderDialog({ card, onClose }: { card: AssessmentCard; onClose: () => void }) {
  const queryClient = useQueryClient();
  const meta = CARD_META[card.card_type] ?? CARD_META.health_assessment;

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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
        style={{ maxHeight: '85vh' }}
      >
        <header className="flex items-start justify-between border-b border-foreground/[0.06] px-5 py-3">
          <div>
            <div className={cn('text-[10px] uppercase tracking-[0.18em]', meta.tone)}>{meta.label}</div>
            <div className="text-base font-semibold">{title}</div>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]"
            aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {intro && (
            <p className="rounded-xl bg-foreground/[0.03] p-3 text-xs text-foreground/75">{intro}</p>
          )}

          {questions.length === 0 ? (
            // No form — this is a read-only card. Render the generated_content as-is.
            <pre className="whitespace-pre-wrap rounded-xl bg-foreground/[0.03] p-3 text-xs text-foreground/85">
              {JSON.stringify(card.generated_content, null, 2)}
            </pre>
          ) : (
            questions.map((q) => (
              <QuestionField
                key={q.id}
                q={q}
                value={answers[q.id]}
                onChange={(v) => setAnswers((s) => ({ ...s, [q.id]: v }))}
              />
            ))
          )}
        </div>

        {questions.length > 0 && (
          <footer className="flex items-center justify-between gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3">
            <div className="text-[11px] text-foreground/55">
              {card.has_responses ? 'Updating saved answers.' : 'Your nutritionist will see this.'}
            </div>
            <button
              type="button"
              onClick={() => submitMut.mutate()}
              disabled={submitMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {card.has_responses ? 'Update' : 'Submit'}
            </button>
          </footer>
        )}
      </motion.div>
    </div>
  );
}

function QuestionField({ q, value, onChange }: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const inputCls = 'w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:outline-none';

  return (
    <div>
      <div className="mb-2 text-sm font-medium text-foreground/90">{q.question}</div>
      {q.type === 'scale' ? (
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={cn(
                'h-9 w-9 rounded-full text-sm font-medium transition-colors',
                value === n
                  ? 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white'
                  : 'border border-foreground/15 text-foreground/65 hover:bg-foreground/[0.05]',
              )}
            >
              {n}
            </button>
          ))}
        </div>
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
                  ? 'border-violet-400/60 bg-violet-400/10'
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
                    ? 'border-violet-400/60 bg-violet-400/10'
                    : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
                )}
              >
                <span className={cn(
                  'grid h-4 w-4 place-items-center rounded border',
                  on ? 'border-violet-400 bg-violet-500 text-white' : 'border-foreground/30',
                )}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
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
    return [{ id, question: qtext, type: t, options }];
  });

  return { title, intro, questions };
}

function extractTitle(card: AssessmentCard): string | null {
  const c = card.generated_content as Record<string, unknown>;
  if (!c || typeof c !== 'object') return null;
  return (c.title ?? c.name ?? null) as string | null;
}