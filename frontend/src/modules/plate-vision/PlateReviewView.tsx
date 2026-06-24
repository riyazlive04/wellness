import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, ChevronRight, Flag, Lightbulb, Loader2, Maximize2, PencilLine, Utensils, X,
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
                ? 'border-violet-500/40 bg-violet-500/[0.08] text-foreground'
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
                        selectedId2 === p.id ? 'bg-violet-500/[0.07]' : 'hover:bg-foreground/[0.02]',
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
      {/* Fullscreen photo zoom (lightbox) */}
      <AnimatePresence>
        {zoomed && plate.photo_url && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomed(false)}
            className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <button
              type="button"
              onClick={() => setZoomed(false)}
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <motion.img
              src={plate.photo_url}
              alt=""
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.92 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Glass variant="heavy" className="overflow-hidden">
        {plate.photo_url && (
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="group relative block w-full cursor-zoom-in overflow-hidden"
            aria-label="Zoom photo"
          >
            <img
              src={plate.photo_url}
              alt={`${plate.client_name ?? 'Client'}'s ${MEAL_TYPE_LABEL[plate.meal_type]}`}
              className="block max-h-72 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
              <Maximize2 className="h-3 w-3" /> Zoom
            </span>
          </button>
        )}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium">{plate.client_name ?? 'Client'}</h2>
                <ReviewBadge status={plate.review_status} />
              </div>
              <div className="mt-0.5 text-[11px] text-foreground/55">
                {MEAL_TYPE_LABEL[plate.meal_type]} · {formatDateTime(plate.logged_at)}
                {plate.ai_confidence != null && <> · AI {Math.round(plate.ai_confidence * 100)}%</>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-semibold tabular-nums">{plate.totals.energy_kcal}</div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">kcal</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <Macro label="Protein" value={plate.totals.protein_g} />
            <Macro label="Carbs" value={plate.totals.carbohydrate_g} />
            <Macro label="Fat" value={plate.totals.fat_g} />
            <Macro label="Fiber" value={plate.totals.fiber_g} />
          </div>
        </div>
      </Glass>

      {/* Items */}
      <Glass className="overflow-hidden">
        <div className="border-b border-foreground/[0.06] px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
          Items · {plate.resolved_count}/{plate.item_count} resolved
        </div>
        <ul className="divide-y divide-foreground/[0.05]">
          {(plate.items ?? []).map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm text-foreground">{it.food_name ?? it.detected_name}</div>
                <div className="mt-0.5 text-[11px] text-foreground/55">
                  {it.quantity_g}g{it.cooking_method && <> · {it.cooking_method.replace(/_/g, ' ')}</>}
                  {it.resolution_status !== 'resolved' && (
                    <span className="ml-1.5 text-amber-600 dark:text-amber-300">· needs review</span>
                  )}
                </div>
              </div>
              <div className="text-right text-xs tabular-nums">
                {it.nutrition ? (
                  <>
                    <div className="font-medium">{it.nutrition.energy_kcal} kcal</div>
                    <div className="text-foreground/55">
                      P{it.nutrition.protein_g} C{it.nutrition.carbohydrate_g} F{it.nutrition.fat_g}
                    </div>
                  </>
                ) : (
                  <span className="text-foreground/40">—</span>
                )}
              </div>
            </li>
          ))}
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

      {/* Review actions */}
      <Glass className="space-y-3 p-4">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Add a note for the client (optional)…"
          className="w-full resize-none rounded-lg border border-foreground/[0.1] bg-transparent px-3 py-2 text-sm placeholder:text-foreground/35 focus:border-violet-500/40 focus:outline-none"
        />
        {plate.review_note && plate.review_status !== 'pending' && (
          <p className="text-[11px] text-foreground/50">Last note: “{plate.review_note}”</p>
        )}
        <div className="flex flex-wrap gap-2">
          <ReviewButton
            onClick={() => reviewMut.mutate('approved')}
            pending={reviewMut.isPending}
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Approve"
            tone="emerald"
          />
          <ReviewButton
            onClick={() => reviewMut.mutate('adjusted')}
            pending={reviewMut.isPending}
            icon={<PencilLine className="h-4 w-4" />}
            label="Mark adjusted"
            tone="sky"
          />
          <ReviewButton
            onClick={() => reviewMut.mutate('flagged')}
            pending={reviewMut.isPending}
            icon={<Flag className="h-4 w-4" />}
            label="Flag"
            tone="rose"
          />
        </div>
      </Glass>
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

function Macro({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-foreground/[0.03] py-2">
      <div className="text-sm font-semibold tabular-nums">{value == null ? '—' : `${value}g`}</div>
      <div className="text-[9px] uppercase tracking-[0.14em] text-foreground/45">{label}</div>
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
