import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarPlus, Check, Copy, Download, EyeOff, FileSpreadsheet, Loader2, Pencil, Plus, RotateCcw, Send, Sparkles, Trash2, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import { optimistic } from '@/lib/optimistic';
import {
  DEFAULT_SLOTS, MEAL_SLOTS, SLOT_LABELS, cardsByDay, dayDate, mealPlansApi, slotLabel,
  type MealCard, type MealPlan, type MealSlot, type MealSlotEntry,
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

  // The practice's meal times (names + which ones), shared by every client.
  const schedule: MealSlotEntry[] = useMemo(
    () => slotsQ.data?.schedule ?? DEFAULT_SLOTS.map((slot) => ({ slot, label: SLOT_LABELS[slot], custom: false })),
    [slotsQ.data?.schedule],
  );
  const labelOf = (slot: MealSlot) => schedule.find((e) => e.slot === slot)?.label ?? slotLabel(plan, slot);

  // Rename / hide / add a meal time: instant on screen, saved for the whole practice.
  type SlotsData = NonNullable<typeof slotsQ.data>;
  const scheduleMut = useMutation({
    mutationFn: (next: MealSlotEntry[]) =>
      mealPlansApi.setSchedule(next.map((e) => ({ slot: e.slot, label: e.custom ? e.label : undefined }))),
    ...optimistic<SlotsData, MealSlotEntry[]>(
      qc,
      ['workspace', 'meal-plans', 'slots'],
      (old, next) => ({ ...old, schedule: MEAL_SLOTS.flatMap((s) => next.filter((e) => e.slot === s)) }),
      // Plans carry the practice's names too.
      { errorMessage: 'Could not save your meal times', also: [['workspace', 'meal-plan']] },
    ),
  });
  const renameSlot = (slot: MealSlot, name: string) => {
    const clean = name.trim();
    const entry = { slot, label: clean || SLOT_LABELS[slot], custom: !!clean && clean !== SLOT_LABELS[slot] };
    const rest = schedule.filter((e) => e.slot !== slot);
    scheduleMut.mutate([...rest, entry]);
  };
  const hideSlot = (slot: MealSlot) => {
    scheduleMut.mutate(schedule.filter((e) => e.slot !== slot));
    toast.success(`${labelOf(slot)} is hidden for all your clients`);
  };
  const addSlot = (slot: MealSlot) => {
    scheduleMut.mutate([...schedule, { slot, label: SLOT_LABELS[slot], custom: false }]);
  };

  // Keep the notes textarea in step with whichever plan is open.
  useEffect(() => {
    setNotesDraft(plan?.notes ?? '');
  }, [plan?.id, plan?.notes]);

  // The practice's meal times, plus any other slot this week already has meals in.
  const visibleSlots = useMemo<MealSlot[]>(() => {
    const used = new Set((plan?.cards ?? []).map((c) => c.meal_type));
    schedule.forEach((e) => used.add(e.slot));
    return MEAL_SLOTS.filter((s) => used.has(s));
  }, [plan?.cards, schedule]);

  // Slot types not on the grid yet — offered by the "Add slot" control.
  const addableSlots = useMemo<MealSlot[]>(
    () => MEAL_SLOTS.filter((s) => !visibleSlots.includes(s)),
    [visibleSlots],
  );

  useEffect(() => {
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
              title={slotsQ.data?.aiEnabled ? undefined : 'AI is off for your practice. See Settings -> AI to turn it on.'}
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
                      <td className="sticky left-0 z-10 border-b border-foreground/[0.04] bg-surface-1 px-2 py-1.5 text-xs font-medium text-foreground/70">
                        <SlotName
                          name={labelOf(slot)}
                          standard={SLOT_LABELS[slot]}
                          onSave={(name) => {
                            if (name.trim() !== labelOf(slot)) renameSlot(slot, name);
                          }}
                          onHide={
                            schedule.some((e) => e.slot === slot) && schedule.length > 1
                              ? () => hideSlot(slot)
                              : undefined
                          }
                          hideBlocked={
                            (plan.cards ?? []).some((c) => c.meal_type === slot)
                              ? 'This week has meals in this row. Move or delete them first.'
                              : undefined
                          }
                        />
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
                                    ? `Add another meal to ${labelOf(slot)} on day ${day}`
                                    : `Add ${labelOf(slot)} on day ${day}`
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

          {/* Add a meal time (Early morning, Mid-breakfast, extra snacks, …)
              to the practice's schedule. */}
          <div className="flex flex-wrap items-center gap-3">
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
                          addSlot(s);
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
            <p className="text-[11px] text-foreground/45">
              Meal times are the same for all your clients. Click a name to rename or hide it.
            </p>
          </div>

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
          slotName={labelOf(adding.slot)}
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
          schedule={schedule}
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

/**
 * A meal-time row's name, renamable in place. Saving an empty name (or
 * "Reset") puts the standard name back.
 */
function SlotName({
  name, standard, onSave, onHide, hideBlocked,
}: {
  name: string;
  standard: string;
  onSave: (name: string) => void;
  /** Hide this meal time for the whole practice; absent when it can't be hidden. */
  onHide?: () => void;
  /** Why hiding is blocked right now (meals in this row this week). */
  hideBlocked?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const custom = name !== standard;

  // Enter, the tick and blur can all fire for one edit; save it once.
  const saved = useRef(false);
  const start = () => { saved.current = false; setDraft(name); setEditing(true); };
  const save = () => {
    if (saved.current) return;
    saved.current = true;
    setEditing(false);
    onSave(draft);
  };

  if (editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save(); }
              if (e.key === 'Escape') { saved.current = true; setEditing(false); }
            }}
            placeholder={standard}
            aria-label={`Name for ${standard}`}
            className="min-w-0 flex-1 rounded-md border border-teal-400/50 bg-background px-1.5 py-1 text-xs focus:outline-none"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={save}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-teal-600 hover:bg-teal-400/10"
            aria-label="Save name"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {custom && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { saved.current = true; setEditing(false); onSave(''); }}
              className="inline-flex items-center gap-1 text-[10px] text-foreground/45 hover:text-foreground/75"
            >
              <RotateCcw className="h-2.5 w-2.5" /> Use "{standard}"
            </button>
          )}
          {onHide && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { saved.current = true; setEditing(false); onHide(); }}
              disabled={!!hideBlocked}
              title={hideBlocked ?? 'Hide this meal time for all your clients'}
              className="inline-flex items-center gap-1 text-[10px] text-foreground/45 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-foreground/45"
            >
              <EyeOff className="h-2.5 w-2.5" /> Hide
            </button>
          )}
        </div>
        <p className="text-[10px] leading-snug text-foreground/40">Changes this for all your clients.</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title="Rename or hide this meal time"
      className="group flex w-full items-start gap-1 rounded-md px-1 py-0.5 text-left hover:bg-foreground/[0.04]"
    >
      <span className="min-w-0 flex-1">
        <span className="block break-words">{name}</span>
        {custom && <span className="block text-[10px] font-normal text-foreground/40">{standard}</span>}
      </span>
      <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-foreground/25 transition-colors group-hover:text-teal-600" />
    </button>
  );
}
