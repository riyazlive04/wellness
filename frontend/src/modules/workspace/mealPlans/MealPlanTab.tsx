import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarPlus, Copy, Download, FileSpreadsheet, Loader2, Plus, Send, Sparkles, Trash2, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import { optimistic } from '@/lib/optimistic';
import {
  DEFAULT_SLOTS, MEAL_SLOTS, SLOT_LABELS, cardsByDay, dayDate, mealPlansApi,
  type MealCard, type MealPlan, type MealSlot,
} from '../api/mealPlans';
import { exportMealPlanExcel, exportMealPlanPdf } from './mealPlanExport';
import { AddMealDialog } from './AddMealDialog';
import { GeneratePlanDialog } from './GeneratePlanDialog';

/** Monday of the current week, as YYYY-MM-DD — the natural default start. */
function nextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun
  const delta = day === 1 ? 0 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * The nutritionist's weekly meal planner for one client. Lives as a tab on the
 * client detail page, because a plan is meaningless outside the context of the
 * person it's for.
 */
export function MealPlanTab({
  clientId,
  clientName,
  clientProfile,
}: {
  clientId: string;
  clientName: string;
  clientProfile?: { label: string; value: string }[];
}) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ day: number; slot: MealSlot; card?: MealCard | null } | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  // Extra meal-time rows the nutritionist has added to this week that don't yet
  // hold any meals (once a slot has a card it stays via `used` below).
  const [extraSlots, setExtraSlots] = useState<Set<MealSlot>>(new Set());
  const [slotMenuOpen, setSlotMenuOpen] = useState(false);
  // Nutritionist's plan-wide notes (draft mirrors the server value; saved on blur).
  const [notesDraft, setNotesDraft] = useState('');

  const plansQ = useQuery({
    queryKey: ['workspace', 'meal-plans', clientId],
    queryFn: () => mealPlansApi.list(clientId),
    staleTime: 30_000,
  });

  const plans = plansQ.data?.items ?? [];
  // Default to the newest plan until the user picks one.
  const activeId = selectedId ?? plans[0]?.id ?? null;

  const planQ = useQuery({
    queryKey: ['workspace', 'meal-plan', activeId],
    queryFn: () => mealPlansApi.get(activeId!),
    enabled: !!activeId,
  });
  const plan = planQ.data;

  const slotsQ = useQuery({
    queryKey: ['workspace', 'meal-plans', 'slots'],
    queryFn: () => mealPlansApi.slots(),
    staleTime: 5 * 60_000,
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plan', activeId] });
    void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plans', clientId] });
  }

  const createMut = useMutation({
    mutationFn: () => mealPlansApi.create({ clientId, startDate: nextMonday() }),
    onSuccess: (p) => {
      setSelectedId(p.id);
      void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plans', clientId] });
      toast.success(`Week ${p.week_number} created`);
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not create the plan'),
  });

  // Optimistic: the Publish/Draft badge flips instantly on the open plan.
  const statusMut = useMutation({
    mutationFn: (status: 'draft' | 'published') => mealPlansApi.setStatus(plan!.id, status),
    ...optimistic<MealPlan, 'draft' | 'published'>(
      qc,
      ['workspace', 'meal-plan', activeId],
      (old, status) => ({ ...old, status }),
      { errorMessage: 'Could not change the status', also: [['workspace', 'meal-plans', clientId]] },
    ),
    onSuccess: (p) =>
      toast.success(p.status === 'published' ? `${clientName} can now see this plan` : 'Pulled back to draft'),
  });

  const duplicateMut = useMutation({
    mutationFn: () => mealPlansApi.duplicate(plan!.id, nextMonday()),
    onSuccess: (p) => {
      setSelectedId(p.id);
      void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plans', clientId] });
      toast.success(`Copied to week ${p.week_number}`);
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not duplicate'),
  });

  const deleteMut = useMutation({
    mutationFn: () => mealPlansApi.remove(plan!.id),
    onSuccess: () => {
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plans', clientId] });
      toast.success('Plan deleted');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not delete'),
  });

  const notesMut = useMutation({
    mutationFn: (notes: string) => mealPlansApi.updateNotes(plan!.id, notes),
    ...optimistic<MealPlan, string>(
      qc,
      ['workspace', 'meal-plan', activeId],
      (old, notes) => ({ ...old, notes: notes.trim() || null }),
      { errorMessage: 'Could not save notes', also: [['workspace', 'meal-plans', clientId]] },
    ),
    onSuccess: () => toast.success('Notes saved'),
  });

  // Keep the notes textarea in step with whichever plan is open.
  useEffect(() => {
    setNotesDraft(plan?.notes ?? '');
  }, [plan?.id, plan?.notes]);

  // Show the slots this plan already uses, plus the usual defaults, so an empty
  // plan still offers somewhere to click.
  const visibleSlots = useMemo<MealSlot[]>(() => {
    const used = new Set((plan?.cards ?? []).map((c) => c.meal_type));
    DEFAULT_SLOTS.forEach((s) => used.add(s));
    extraSlots.forEach((s) => used.add(s));
    return MEAL_SLOTS.filter((s) => used.has(s));
  }, [plan?.cards, extraSlots]);

  // Slot types not on the grid yet — offered by the "Add slot" control.
  const addableSlots = useMemo<MealSlot[]>(
    () => MEAL_SLOTS.filter((s) => !visibleSlots.includes(s)),
    [visibleSlots],
  );

  // Manually-added empty rows are per-week UI state; clear them when the week
  // changes so week 2 doesn't inherit week 1's blank slots.
  useEffect(() => {
    setExtraSlots(new Set());
    setSlotMenuOpen(false);
  }, [activeId]);

  const byDay = useMemo(() => cardsByDay(plan?.cards), [plan?.cards]);

  if (plansQ.isLoading) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-foreground/40" /></div>;
  }

  if (!plans.length) {
    return (
      <Glass className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)]">
          <CalendarPlus className="h-5 w-5 text-teal-700 dark:text-teal-300" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-medium tracking-tight">No meal plans yet</h3>
          <p className="max-w-sm text-sm text-foreground/65">
            Build {clientName} a week of meals - write it yourself, or let AI draft it from their
            profile and edit from there.
          </p>
        </div>
        <button
          type="button"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50"
        >
          {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Start week 1
        </button>
      </Glass>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week switcher + new */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                p.id === activeId
                  ? 'border-teal-400/50 bg-teal-400/10 text-foreground'
                  : 'border-foreground/10 text-foreground/65 hover:bg-foreground/[0.04]',
              )}
            >
              Week {p.week_number}
              <StatusDot status={p.status} />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/[0.04] disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          New week
        </button>
      </div>

      {planQ.isLoading || !plan ? (
        <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-foreground/40" /></div>
      ) : (
        <>
          {/* Toolbar */}
          <Glass className="flex flex-wrap items-center gap-2 p-3">
            <div className="mr-auto">
              <div className="flex items-center gap-2 text-sm font-medium">
                Week {plan.week_number}
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]',
                    plan.status === 'published'
                      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200'
                      : 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
                  )}
                >
                  {plan.status}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-foreground/55">
                {new Date(`${plan.start_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                {' - '}
                {new Date(`${plan.end_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                {' · '}
                {plan.total_kcal.toLocaleString('en-IN')} kcal total
                {byDay.size > 0 && ` · ≈${Math.round(plan.total_kcal / byDay.size)} kcal/day`}
              </div>
            </div>

            <ToolButton
              icon={Sparkles}
              label="AI draft"
              onClick={() => setGenerateOpen(true)}
              disabled={!slotsQ.data?.aiEnabled}
              title={slotsQ.data?.aiEnabled ? undefined : 'AI is not configured on this server'}
            />
            <ToolButton icon={Download} label="PDF" onClick={() => { void exportMealPlanPdf(plan, clientName, { clientProfile, coachNotes: plan.notes ?? undefined }); }} />
            <ToolButton icon={FileSpreadsheet} label="Excel" onClick={() => exportMealPlanExcel(plan, clientName)} />
            <ToolButton icon={Copy} label="Duplicate" onClick={() => duplicateMut.mutate()} disabled={duplicateMut.isPending} />
            <ToolButton
              icon={Trash2}
              label="Delete"
              danger
              onClick={() => {
                if (confirm(`Delete week ${plan.week_number}? This removes its meals.`)) deleteMut.mutate();
              }}
              disabled={deleteMut.isPending}
            />

            {plan.status === 'published' ? (
              <button
                type="button"
                onClick={() => statusMut.mutate('draft')}
                disabled={statusMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-4 py-2 text-xs font-medium hover:bg-foreground/[0.04] disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Unpublish
              </button>
            ) : (
              <button
                type="button"
                onClick={() => statusMut.mutate('published')}
                disabled={statusMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50"
              >
                {statusMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Publish to client
              </button>
            )}
          </Glass>

          {/* Week grid - horizontally scrollable; 7 days never fit a tab pane. */}
          <Glass className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-[130px] border-b border-foreground/[0.06] bg-surface-1 px-3 py-2.5 text-left text-[10px] uppercase tracking-[0.16em] text-foreground/50">
                      Slot
                    </th>
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = dayDate(plan.start_date, i + 1);
                      const dayKcal = (byDay.get(i + 1) ?? []).reduce((s, c) => s + (c.kcal ?? 0), 0);
                      return (
                        <th key={i} className="border-b border-foreground/[0.06] px-2 py-2 text-left">
                          <div className="text-xs font-medium text-foreground/85">
                            {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                          </div>
                          <div className="text-[10px] font-normal text-foreground/45">
                            {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            {dayKcal > 0 && ` · ${dayKcal}`}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleSlots.map((slot) => (
                    <tr key={slot} className="align-top">
                      <td className="sticky left-0 z-10 border-b border-foreground/[0.04] bg-surface-1 px-3 py-2 text-xs font-medium text-foreground/70">
                        {SLOT_LABELS[slot]}
                      </td>
                      {Array.from({ length: 7 }, (_, i) => {
                        const day = i + 1;
                        // A slot can hold MANY meals now — render every card in
                        // it, and always offer a "+" to add one more.
                        const cards = (byDay.get(day) ?? []).filter((c) => c.meal_type === slot);
                        return (
                          <td key={i} className="border-b border-foreground/[0.04] px-1 py-1 align-top">
                            <div className="flex flex-col gap-1">
                              {cards.map((card) => (
                                <button
                                  key={card.id}
                                  type="button"
                                  onClick={() => setAdding({ day, slot, card })}
                                  className="w-full rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] p-2 text-left transition-colors hover:border-teal-400/40 hover:bg-teal-400/[0.06]"
                                >
                                  <div className="line-clamp-2 text-xs font-medium text-foreground/90">{card.meal_name}</div>
                                  <div className="mt-0.5 text-[10px] text-foreground/45">
                                    {[card.quantity && `${card.quantity}${card.unit ? ` ${card.unit}` : ''}`, card.kcal ? `${card.kcal} kcal` : null]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </div>
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setAdding({ day, slot })}
                                className={cn(
                                  'grid w-full place-items-center rounded-lg border border-dashed border-foreground/10 text-foreground/25 transition-colors hover:border-teal-400/40 hover:bg-teal-400/[0.04] hover:text-teal-600',
                                  cards.length ? 'h-7' : 'h-[52px]',
                                )}
                                aria-label={
                                  cards.length
                                    ? `Add another meal to ${SLOT_LABELS[slot]} on day ${day}`
                                    : `Add ${SLOT_LABELS[slot]} on day ${day}`
                                }
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Glass>

          {/* Add another meal-time row (Early morning, Mid-breakfast, extra
              snacks, …) to this week's grid. */}
          {addableSlots.length > 0 && (
            <div className="relative w-fit">
              <button
                type="button"
                onClick={() => setSlotMenuOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-foreground/20 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-teal-400/40 hover:bg-teal-400/[0.04] hover:text-teal-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Add slot
              </button>
              {slotMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setSlotMenuOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute left-0 z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-foreground/10 bg-surface-1 p-1 shadow-xl">
                    {addableSlots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setExtraSlots((prev) => new Set(prev).add(s));
                          setSlotMenuOpen(false);
                        }}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-foreground/80 transition-colors hover:bg-teal-400/[0.08] hover:text-foreground"
                      >
                        {SLOT_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Nutritionist's notes — printed on the PDF and shown to the client. */}
          <div className="mt-2">
            <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-foreground/70">
              Nutritionist's notes
              <span className="text-[10px] font-normal text-foreground/40">shown on the PDF & to the client</span>
            </label>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if (plan && notesDraft !== (plan.notes ?? '')) notesMut.mutate(notesDraft);
              }}
              rows={3}
              maxLength={4000}
              placeholder="General guidance for the week — do's & don'ts, hydration, portion tips…"
              className="w-full resize-y rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm text-foreground/90 placeholder:text-foreground/30 focus:border-teal-400/40 focus:outline-none focus:ring-2 focus:ring-teal-400/10"
            />
          </div>
        </>
      )}

      {adding && plan && (
        <AddMealDialog
          open
          dayNumber={adding.day}
          slot={adding.slot}
          editing={adding.card}
          onClose={() => setAdding(null)}
          onSubmit={async (input) => {
            if (adding.card) {
              await mealPlansApi.updateCard(plan.id, adding.card.id, input);
            } else {
              await mealPlansApi.addCard(plan.id, input);
            }
            refresh();
          }}
          onDelete={
            adding.card
              ? async () => {
                  await mealPlansApi.removeCard(plan.id, adding.card!.id);
                  refresh();
                  toast.success('Meal removed');
                }
              : undefined
          }
        />
      )}

      {generateOpen && plan && (
        <GeneratePlanDialog
          plan={plan}
          clientName={clientName}
          onClose={() => setGenerateOpen(false)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function StatusDot({ status }: { status: 'draft' | 'published' }) {
  return (
    <span
      className={cn('h-1.5 w-1.5 rounded-full', status === 'published' ? 'bg-emerald-400' : 'bg-amber-400')}
      aria-label={status}
    />
  );
}

function ToolButton({
  icon: Icon, label, onClick, disabled, danger, title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        danger ? 'text-foreground/70 hover:bg-rose-500/10 hover:text-rose-600' : 'text-foreground/75 hover:bg-foreground/[0.04]',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
