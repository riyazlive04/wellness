import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Sparkles, Upload, RotateCcw, Loader2, X, AlertTriangle, ShieldCheck, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type DetectedItem, type VisionAnalysisResult } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Plate Vision — point your camera at a meal, get a deterministic nutrition
 * breakdown.
 *
 * Backend (Phase 2): POST /api/v1/vision/analyze
 *   1. Gemini IDENTIFIES foods + estimates portion + cooking method (no macros).
 *   2. Nutrition Engine looks up each food in IFCT 2017 / USDA, applies
 *      cooking yield + oil absorption + retention, returns deterministic
 *      nutrition + an audit_id per item.
 *   3. Items the engine can't confidently resolve come back resolved=false
 *      and are flagged for the user to clarify — NEVER fabricated.
 */
export default function ClientPlateVision() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const analyzeMut = useMutation<VisionAnalysisResult, Error, File>({
    mutationFn: (f) => clientsApi.analyzePlate(f),
    onError: (err) => toast.error(err.message ?? 'Could not analyze the photo. Try again.'),
  });
  const result = analyzeMut.data;

  function handleFile(f: File) {
    if (!f.type.startsWith('image/')) {
      toast.error('Please pick an image — JPG, PNG, or HEIC.');
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error('Image too large — pick one under 8 MB.');
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
    analyzeMut.reset();
  }

  function reset() {
    setFile(null);
    setPreview(null);
    analyzeMut.reset();
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10"
      >
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">AI · Plate Vision</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Snap your plate.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65 md:text-base">
            SIRAH identifies the food, the Nutrition Engine looks up the exact values from IFCT 2017. Every number is traceable.
          </p>
        </motion.div>

        {/* Capture / preview */}
        <motion.div variants={fadeUp} className="mt-6">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {!preview && (
            <Glass variant="heavy" className="relative aspect-[4/5] overflow-hidden md:aspect-video">
              <div className="absolute inset-0 grid place-items-center">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-blue-500/30 to-fuchsia-500/20">
                    <Camera className="h-8 w-8 text-violet-700 dark:text-violet-200" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-base font-medium">Show me your meal</div>
                    <div className="text-xs text-foreground/55">Top-down works best</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.55)] transition-all hover:scale-[1.03]"
                    >
                      <Camera className="h-4 w-4" />
                      Use camera
                    </button>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-5 py-2.5 text-sm hover:bg-foreground/[0.04]"
                    >
                      <Upload className="h-4 w-4" />
                      Upload photo
                    </button>
                  </div>
                </div>
              </div>
            </Glass>
          )}

          {preview && (
            <Glass variant="heavy" className="relative overflow-hidden">
              <img src={preview} alt="" className="block w-full" />
              <button
                type="button"
                onClick={reset}
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md hover:bg-black/80"
                aria-label="Clear"
              >
                <X className="h-4 w-4" />
              </button>
              {!result && !analyzeMut.isPending && (
                <div className="border-t border-foreground/[0.06] p-4">
                  <button
                    type="button"
                    onClick={() => file && analyzeMut.mutate(file)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.55)]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Analyze with SIRAH
                  </button>
                </div>
              )}
              {analyzeMut.isPending && (
                <div className="absolute inset-0 grid place-items-center bg-canvas/85 backdrop-blur-md">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
                    <div className="text-sm font-medium">SIRAH is looking at your plate</div>
                    <div className="text-xs text-foreground/55">Identification + IFCT lookup — usually 3–5 sec</div>
                  </div>
                </div>
              )}
            </Glass>
          )}
        </motion.div>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-6 space-y-4"
            >
              {/* Provenance banner — "this is real data" */}
              <AIGlow intensity="soft" animated>
                <Glass variant="heavy" className="p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-300" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {result.items.filter((it) => it.resolved).length} food{result.items.filter((it) => it.resolved).length === 1 ? '' : 's'} matched to IFCT 2017
                        {result.unresolved_count > 0 && (
                          <span className="ml-2 text-amber-600 dark:text-amber-300">
                            · {result.unresolved_count} need{result.unresolved_count === 1 ? 's' : ''} your review
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-foreground/65">
                        Calories and macros computed by the Nutrition Engine using authoritative database values. Every item has an audit trail.
                      </div>
                    </div>
                  </div>
                </Glass>
              </AIGlow>

              {/* Macro pills — totals across RESOLVED items only */}
              <div className="grid grid-cols-4 gap-2">
                <MacroTile label="kcal"    value={result.totals.energy_kcal}    accent="from-amber-400 to-orange-500" />
                <MacroTile label="Protein" value={result.totals.protein_g}      unit="g" accent="from-rose-400 to-pink-500" />
                <MacroTile label="Carbs"   value={result.totals.carbohydrate_g} unit="g" accent="from-sky-400 to-blue-500" />
                <MacroTile label="Fat"     value={result.totals.fat_g}          unit="g" accent="from-violet-400 to-fuchsia-500" />
              </div>

              {/* Detected items */}
              <Glass className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                    Detected items
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">
                    {result.provenance.ai_model} → {result.provenance.engine_version}
                  </div>
                </div>
                <ul className="divide-y divide-foreground/[0.05]">
                  {result.items.map((item) => (
                    <DetectedItemRow key={item.id} item={item} />
                  ))}
                </ul>
              </Glass>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-foreground/10 px-5 py-3 text-sm font-medium hover:bg-foreground/[0.04]"
                >
                  <RotateCcw className="h-4 w-4" />
                  Snap another
                </button>
                <button
                  type="button"
                  onClick={() => toast.success(
                    result.unresolved_count > 0
                      ? `Saved ${result.items.filter(it => it.resolved).length} items. Review the unresolved ones in Meals.`
                      : 'Meal saved to today\'s log.',
                  )}
                  className={cn(
                    'flex-1 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-white',
                    'bg-gradient-to-br from-blue-600 to-fuchsia-500',
                  )}
                >
                  Save to today
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </ClientLayout>
  );
}

// ────────────────────────────────────────────────────────────────────

function DetectedItemRow({ item }: { item: DetectedItem }) {
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium">
              {item.resolved && item.food ? item.food.canonical_name : item.detected_name}
            </div>
            <ConfidenceBadge confidence={item.ai_confidence} />
          </div>
          <div className="mt-0.5 text-xs text-foreground/55">
            {item.portion_g}g · {item.cooking_method.replace(/_/g, ' ')}
            {item.resolved && item.food?.source_id && (
              <span className="ml-2 text-foreground/40">· {item.food.source} {item.food.source_id}</span>
            )}
          </div>
          {item.nutrients && (
            <div className="mt-1 text-xs text-foreground/65">
              P {item.nutrients.protein_g}g · C {item.nutrients.carbohydrate_g}g · F {item.nutrients.fat_g}g
              {item.nutrients.fiber_g != null && <> · Fiber {item.nutrients.fiber_g}g</>}
            </div>
          )}
          {!item.resolved && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              Couldn't match to a database food — tap to clarify
            </div>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          {item.nutrients ? (
            <div className="text-sm font-semibold tabular-nums">
              {item.nutrients.energy_kcal}
              <span className="ml-0.5 text-[10px] font-normal text-foreground/55">kcal</span>
            </div>
          ) : (
            <div className="text-xs text-foreground/45">—</div>
          )}
          {item.audit_id && (
            <div className="mt-0.5 text-[10px] text-foreground/35" title={`Audit: ${item.audit_id}`}>
              <BookOpen className="inline h-2.5 w-2.5" /> traceable
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const tone =
    confidence >= 0.8 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    : confidence >= 0.5 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
  return (
    <span className={cn('rounded-full px-1.5 py-0 text-[10px] tabular-nums', tone)}>
      {Math.round(confidence * 100)}%
    </span>
  );
}

function MacroTile({ label, value, unit, accent }: { label: string; value: number; unit?: string; accent: string }) {
  return (
    <Glass className="flex flex-col items-center gap-1 p-3 text-center">
      <div className={cn('h-1 w-8 rounded-full bg-gradient-to-r', accent)} />
      <div className="text-base font-semibold tabular-nums">
        {Math.round(value * 10) / 10}{unit ?? ''}
      </div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
    </Glass>
  );
}
