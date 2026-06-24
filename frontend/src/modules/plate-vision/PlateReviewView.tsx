import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Flag, Lightbulb, Loader2, Maximize2, PencilLine, Utensils, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import {
  plateVisionApi,
  MEAL_TYPE_LABEL,
  REVIEW_STATUS_LABEL,
  type PlateReviewStatus,
  type ReviewQueueItem,
} from '@/modules/workspace/api/plate-vision';

/**
 * PlateReviewView — nutritionist review queue for logged Plate Vision meals.
 *
 * Left: the queue (pending first), filterable by status. Right: the selected
 * plate — photo, per-food nutrition, frozen totals, the AI insight, and the
 * approve / adjust / flag actions.
 */
const STATUS_FILTERS: Array<{ value: PlateReviewStatus | 'all'; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'approved', label: 'Approved' },
  { value: 'adjusted', label: 'Adjusted' },
  { value: 'all', label: 'All' },
];

export function PlateReviewView({ heroEyebrow }: { heroEyebrow: string }) {
  const [status, setStatus] = useState<PlateReviewStatus | 'all'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queueQ = useQuery({
    queryKey: ['plate-review', status],
    queryFn: () => plateVisionApi.reviewQueue(status === 'all' ? {} : { status }),
    retry: 1,
    staleTime: 0,
  });

  const queue = queueQ.data ?? [];
  const selectedId2 = selectedId ?? queue[0]?.id ?? null;

  return (
    <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
      <motion.div variants={fadeUp}>
        <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/45">{heroEyebrow}</span>
        <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">Plate review</h1>
        <p className="mt-2 max-w-2xl text-sm text-foreground/60">
          Meals your clients logged with Plate Vision. Nutrition is computed by the engine from IFCT/USDA —
          you review the identification + portions and approve, adjust, or flag.
        </p>
      </motion.div>

      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => { setStatus(f.value); setSelectedId(null); }}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              status === f.value
                ? 'border-teal-500/40 bg-teal-500/[0.08] text-teal-700 dark:text-teal-300'
                : 'border-foreground/[0.08] text-foreground/70 hover:border-foreground/15',
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] tabular-nums text-foreground/40">
          {queue.length} {queue.length === 1 ? 'plate' : 'plates'}
        </span>
      </motion.div>

      {queueQ.isLoading ? (
        <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </Glass>
      ) : queue.length === 0 ? (
        <Glass className="flex flex-col items-center gap-2 p-12 text-center">
          <Utensils className="h-7 w-7 text-foreground/30" />
          <div className="text-sm text-foreground/60">Nothing to review here.</div>
        </Glass>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px,1fr]">
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              <ul className="divide-y divide-foreground/[0.05]">
                {queue.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                        selectedId2 === p.id ? 'bg-teal-500/[0.08]' : 'hover:bg-foreground/[0.02]',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {p.client_name ?? 'Client'}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-foreground/55">
                          <span>{MEAL_TYPE_LABEL[p.meal_type]}</span>
                          <span>·</span>
                          <span className="tabular-nums">{p.totals.energy_kcal} kcal</span>
                          <span>·</span>
                          <span>{formatRelative(p.logged_at)}</span>
                        </div>
                      </div>
                      <ReviewBadge status={p.review_status} />
                      <ChevronRight className="h-3.5 w-3.5 text-foreground/30" />
                    </button>
                  </li>
                ))}
              </ul>
            </Glass>
          </motion.div>

          <motion.div variants={fadeUp}>
            {selectedId2 ? <PlateDetail plateId={selectedId2} statusFilter={status} /> : null}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function PlateDetail({ plateId, statusFilter }: { plateId: string; statusFilter: PlateReviewStatus | 'all' }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [zoomed, setZoomed] = useState(false);
  const [scale, setScale] = useState(1);
  const closeZoom = () => { setZoomed(false); setScale(1); };

  const plateQ = useQuery({
    queryKey: ['plate-review', 'detail', plateId],
    queryFn: () => plateVisionApi.getForReview(plateId),
    retry: 1,
  });

  const reviewMut = useMutation({
    mutationFn: (status: 'approved' | 'adjusted' | 'flagged') =>
      plateVisionApi.review(plateId, { status, note: note.trim() || undefined }),
    onSuccess: (updated) => {
      toast.success(`Marked ${REVIEW_STATUS_LABEL[updated.review_status].toLowerCase()}`);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['plate-review'] });
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  if (plateQ.isLoading || !plateQ.data) {
    return (
      <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </Glass>
    );
  }

  const plate = plateQ.data;
  void statusFilter;

  return (
    <div className="space-y-4">
      {/* Fullscreen photo zoom (lightbox) — the image can be dragged to pan,
          scrolled or double-clicked to zoom. */}
      <AnimatePresence>
        {zoomed && plate.photo_url && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeZoom}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/80 p-4 backdrop-blur-sm"
          >
            <button
              type="button"
              onClick={closeZoom}
              className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/80 backdrop-blur-sm">
              Drag to move · scroll or double-click to zoom
            </span>
            {/* Only this image is movable — drag pans, wheel zooms. */}
            <motion.div
              drag
              dragMomentum={false}
              dragElastic={0.05}
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => {
                e.stopPropagation();
                setScale((s) => Math.min(4, Math.max(1, s + (e.deltaY < 0 ? 0.25 : -0.25))));
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setScale((s) => (s > 1 ? 1 : 2));
              }}
              className="cursor-grab active:cursor-grabbing"
            >
              <img
                src={plate.photo_url}
                alt=""
                draggable={false}
                style={{ transform: `scale(${scale})` }}
                className="max-h-[88vh] max-w-[90vw] select-none rounded-2xl object-contain shadow-2xl transition-transform duration-150"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
        {/* Photo card */}
        <Glass variant="heavy" className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-foreground/[0.06] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold">{plate.client_name ?? 'Client'}</span>
              <span className="flex-shrink-0 text-[11px] text-foreground/45">· {MEAL_TYPE_LABEL[plate.meal_type]}</span>
            </div>
            <ReviewBadge status={plate.review_status} />
          </div>
          {plate.photo_url ? (
            <button
              type="button"
              onClick={() => setZoomed(true)}
              className="group relative block w-full cursor-zoom-in overflow-hidden"
              aria-label="Zoom photo"
            >
              <img
                src={plate.photo_url}
                alt={`${plate.client_name ?? 'Client'}'s ${MEAL_TYPE_LABEL[plate.meal_type]}`}
                className="block aspect-[4/3] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
                <Maximize2 className="h-3 w-3" /> Zoom
              </span>
            </button>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center bg-foreground/[0.03] text-foreground/25">
              <Utensils className="h-8 w-8" />
            </div>
          )}
        </Glass>

        {/* Nutrition card */}
        <Glass variant="heavy" className="flex flex-col p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Plate nutrition</span>
            {plate.ai_confidence != null && (
              <span className="text-[11px] text-foreground/45">AI {Math.round(plate.ai_confidence * 100)}%</span>
            )}
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="bg-gradient-to-br from-foreground to-teal-600 bg-clip-text text-4xl font-semibold tabular-nums text-transparent dark:to-teal-300">
              {plate.totals.energy_kcal}
            </span>
            <span className="text-xs font-medium text-foreground/55">kcal</span>
          </div>

          <div className="mt-4 space-y-2.5">
            <MacroBar label="Protein" value={plate.totals.protein_g} max={45} cls="from-rose-400 to-pink-400" />
            <MacroBar label="Carbs" value={plate.totals.carbohydrate_g} max={90} cls="from-sky-400 to-blue-400" />
            <MacroBar label="Fat" value={plate.totals.fat_g} max={45} cls="from-teal-400 to-emerald-400" />
          </div>

          <div className="mt-4 flex items-center gap-2.5 text-[12px] text-foreground/55">
            <span className="flex-shrink-0 tabular-nums">{plate.resolved_count} / {plate.item_count} matched</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-500"
                style={{ width: `${plate.item_count ? (plate.resolved_count / plate.item_count) * 100 : 0}%` }}
              />
            </div>
          </div>

          {plate.item_count > plate.resolved_count && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-3.5 py-2.5 text-[13px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                {plate.item_count - plate.resolved_count} food
                {plate.item_count - plate.resolved_count > 1 ? 's' : ''} couldn&apos;t be matched — that&apos;s
                why some macros read 0. Match them below.
              </span>
            </div>
          )}

          {/* Review actions */}
          <div className="mt-auto pt-4">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Add a note for the client (optional)…"
              className="w-full resize-none rounded-lg border border-foreground/[0.1] bg-transparent px-3 py-2 text-sm placeholder:text-foreground/35 focus:border-teal-500/50 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => reviewMut.mutate('approved')}
                disabled={reviewMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
              >
                {reviewMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve
              </button>
              <ReviewButton onClick={() => reviewMut.mutate('adjusted')} pending={reviewMut.isPending} icon={<PencilLine className="h-4 w-4" />} label="Adjust" tone="sky" />
              <ReviewButton onClick={() => reviewMut.mutate('flagged')} pending={reviewMut.isPending} icon={<Flag className="h-4 w-4" />} label="Flag" tone="rose" />
            </div>
          </div>
        </Glass>
      </div>

      {/* Items */}
      <Glass className="overflow-hidden">
        <div className="border-b border-foreground/[0.06] px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
          Items · {plate.resolved_count}/{plate.item_count} resolved
        </div>
        <ul className="divide-y divide-foreground/[0.05]">
          {(plate.items ?? []).map((it) => {
            const unresolved = it.resolution_status !== 'resolved';
            return (
              <li
                key={it.id}
                className={cn('flex items-start justify-between gap-3 px-4 py-3', unresolved && 'bg-amber-400/[0.04]')}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{it.food_name ?? it.detected_name}</span>
                    {unresolved ? (
                      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        needs review
                      </span>
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-foreground/55">
                    {it.quantity_g}g{it.cooking_method && <> · {it.cooking_method.replace(/_/g, ' ')}</>}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right text-xs tabular-nums">
                  {it.nutrition ? (
                    <>
                      <div className="font-semibold">{it.nutrition.energy_kcal} kcal</div>
                      <div className="text-foreground/55">
                        P{it.nutrition.protein_g} C{it.nutrition.carbohydrate_g} F{it.nutrition.fat_g}
                      </div>
                    </>
                  ) : (
                    <span className="text-foreground/40">— kcal</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Glass>

      {/* Insight */}
      {plate.insight && (
        <Glass className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">Insight</span>
            <span className="text-[9px] uppercase tracking-[0.14em] text-foreground/40">
              {plate.insight.source === 'ai' ? 'AI' : 'rule-based'}
            </span>
          </div>
          <p className="text-sm text-foreground/75">{plate.insight.summary}</p>
          {plate.insight.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {plate.insight.flags.map((f) => (
                <span key={f} className="rounded-full bg-rose-500/12 px-2 py-0.5 text-[10px] text-rose-700 dark:text-rose-300">
                  {f.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </Glass>
      )}

    </div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────

function ReviewButton({
  onClick, pending, icon, label, tone,
}: {
  onClick: () => void;
  pending: boolean;
  icon: React.ReactNode;
  label: string;
  tone: 'emerald' | 'sky' | 'rose';
}) {
  const tones = {
    emerald: 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/[0.06]',
    sky: 'border-sky-500/30 text-sky-700 dark:text-sky-300 hover:bg-sky-500/[0.06]',
    rose: 'border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-500/[0.06]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60',
        tones[tone],
      )}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function ReviewBadge({ status }: { status: PlateReviewStatus }) {
  const tone =
    status === 'approved' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
    : status === 'flagged' ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
    : status === 'adjusted' ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
    : 'bg-amber-500/12 text-amber-700 dark:text-amber-300';
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.1em]', tone)}>
      {REVIEW_STATUS_LABEL[status]}
    </span>
  );
}

function MacroBar({ label, value, max, cls }: { label: string; value: number | null; max: number; cls: string }) {
  const v = value ?? 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="text-foreground/55">{label}</span>
        <span className="font-medium tabular-nums">{v} g</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', cls)}
          style={{ width: `${Math.min(100, (v / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
