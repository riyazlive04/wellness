import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Sparkles, Upload, RotateCcw, Loader2, X, AlertTriangle, ShieldCheck, BookOpen, Lightbulb, CheckCircle2, ChevronDown, Utensils } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { CameraCapture } from '@/modules/client/CameraCapture';
import { clientsApi, type DetectedItem, type VisionAnalysisResult } from '@/modules/workspace/api/clients';
import { nutritionApi } from '@/modules/workspace/api/nutrition';
import {
  plateVisionApi, mealTypeForNow, MEAL_TYPES, MEAL_TYPE_LABEL,
  type MealType, type PlateMeal,
} from '@/modules/workspace/api/plate-vision';
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
/**
 * Recompute plate totals when the user has nudged any portion. Nutrition scales
 * linearly with grams for a resolved food, so we can preview the corrected
 * numbers instantly client-side; the server recomputes authoritatively on log.
 * With no edits we keep the server's totals verbatim.
 */
function computeTotals(result: VisionAnalysisResult, portions: Record<string, number>) {
  if (Object.keys(portions).length === 0) return result.totals;
  let energy_kcal = 0, protein_g = 0, carbohydrate_g = 0, fat_g = 0;
  for (const it of result.items) {
    if (!it.resolved || !it.nutrients) continue;
    const f = it.portion_g > 0 ? (portions[it.id] ?? it.portion_g) / it.portion_g : 1;
    energy_kcal += it.nutrients.energy_kcal * f;
    protein_g += it.nutrients.protein_g * f;
    carbohydrate_g += it.nutrients.carbohydrate_g * f;
    fat_g += it.nutrients.fat_g * f;
  }
  return {
    ...result.totals,
    energy_kcal: Math.round(energy_kcal),
    protein_g: Math.round(protein_g),
    carbohydrate_g: Math.round(carbohydrate_g),
    fat_g: Math.round(fat_g),
  };
}

export default function ClientPlateVision() {
  const { t } = useTranslation('clientPlateVision');
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const [preview, setPreview] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow());
  const [logged, setLogged] = useState<PlateMeal | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  // User-corrected portions, keyed by detected-item id. Empty = use AI estimate.
  const [portions, setPortions] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const analyzeMut = useMutation<VisionAnalysisResult, Error, File>({
    mutationFn: (f) => clientsApi.analyzePlate(f),
    onError: (err) => toast.error(err.message ?? t('toast.analyzeError')),
  });
  const result = analyzeMut.data;

  const logMut = useMutation<PlateMeal, Error, VisionAnalysisResult>({
    mutationFn: async (r) => {
      // The thumbnail is generated asynchronously when the photo is picked, so
      // it may not be ready by the time the user taps "Log". Generate it now if
      // needed so the meal always carries its photo for the nutritionist review.
      const photo = thumbUrl ?? (file ? await makeThumbnail(file).catch(() => null) : null);
      return plateVisionApi.log({
        meal_type: mealType,
        source: 'plate_vision',
        photo_url: photo ?? undefined,
        items: r.items.map((it) => ({
          detected_name: it.detected_name,
          // Resolved items log by food_id (re-verified server-side); unresolved
          // pass the name so the server can retry or flag for review.
          food_id: it.resolved && it.food ? it.food.id : undefined,
          food_query: it.resolved ? undefined : it.detected_name,
          quantity_g: portions[it.id] ?? it.portion_g,
          cooking_method: it.cooking_method,
          ai_confidence: it.ai_confidence,
        })),
      });
    },
    onSuccess: (plate) => {
      setLogged(plate);
      toast.success(t('toast.logSuccess'));
    },
    onError: (err) => toast.error(err.message ?? t('toast.logError')),
  });

  function handleFile(f: File) {
    if (!f.type.startsWith('image/')) {
      toast.error(t('toast.pickImage'));
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error(t('toast.tooLarge'));
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
    // Downscaled thumbnail kept for the meal history (full photo isn't persisted).
    setThumbUrl(null);
    makeThumbnail(f).then(setThumbUrl).catch(() => setThumbUrl(null));
    setPortions({});
    analyzeMut.reset();
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setThumbUrl(null);
    setLogged(null);
    setPortions({});
    analyzeMut.reset();
    logMut.reset();
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-5xl space-y-7 px-5 py-8 md:px-8 md:py-10"
      >
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">{t('eyebrow')}</span>
          <h1 className="mt-1 text-balance text-3xl font-semibold tracking-tight md:text-4xl">{t('title')}</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65 md:text-base">
            {t('intro')}
          </p>
        </motion.div>

        {/* Two-column workspace: capture + live result (main) · guidance (side) */}
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
        {/* Capture / preview */}
        <motion.div variants={fadeUp}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {!preview && (
            <Glass variant="heavy" className="relative aspect-[4/5] overflow-hidden md:aspect-video">
              <div className="absolute inset-0 grid place-items-center">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-blue-500/30 to-cyan-500/20">
                    <Camera className="h-8 w-8 text-teal-700 dark:text-teal-200" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-base font-medium">{t('capture.prompt')}</div>
                    <div className="text-xs text-foreground/55">{t('capture.hint')}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCameraOpen(true)}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.55)] transition-all hover:scale-[1.03] cta-glow active:scale-[0.97]"
                    >
                      <Camera className="h-4 w-4" />
                      {t('capture.useCamera')}
                    </button>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-5 py-2.5 text-sm hover:bg-foreground/[0.04]"
                    >
                      <Upload className="h-4 w-4" />
                      {t('capture.uploadPhoto')}
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
                aria-label={t('capture.clear')}
              >
                <X className="h-4 w-4" />
              </button>
              {!result && !analyzeMut.isPending && (
                <div className="border-t border-foreground/[0.06] p-4">
                  <button
                    type="button"
                    onClick={() => file && analyzeMut.mutate(file)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.55)]"
                  >
                    <Sparkles className="h-4 w-4" />
                    {t('capture.analyze')}
                  </button>
                </div>
              )}
              {analyzeMut.isPending && (
                <div className="absolute inset-0 grid place-items-center bg-canvas/85 backdrop-blur-md">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                    <div className="text-sm font-medium">{t('capture.analyzingTitle')}</div>
                    <div className="text-xs text-foreground/55">{t('capture.analyzingHint')}</div>
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
              className="space-y-4"
            >
              {/* Provenance banner - "this is real data" */}
              <AIGlow intensity="soft" animated>
                <Glass variant="heavy" className="p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-300" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {t('provenance.foodsMatched', { count: result.items.filter((it) => it.resolved).length })}
                        {result.unresolved_count > 0 && (
                          <span className="ml-2 text-amber-600 dark:text-amber-300">
                            · {t('provenance.needsReview', { count: result.unresolved_count })}
                          </span>
                        )}
                      </div>
                      {/* Detected food names - surfaced up front */}
                      {result.items.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {result.items.map((it) => (
                            <span
                              key={it.id}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs',
                                it.resolved
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                              )}
                            >
                              {it.resolved && it.food ? it.food.canonical_name : it.detected_name}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 text-xs text-foreground/65">
                        {t('provenance.note')}
                      </div>
                    </div>
                  </div>
                </Glass>
              </AIGlow>

              {/* Macro pills - totals across RESOLVED items only (live as you correct portions) */}
              {(() => {
                const totals = computeTotals(result, portions);
                return (
                  <div className="grid grid-cols-4 gap-2">
                    <MacroTile label="kcal"    value={totals.energy_kcal}    accent="from-amber-400 to-orange-500" />
                    <MacroTile label="Protein" value={totals.protein_g}      unit="g" accent="from-rose-400 to-pink-500" />
                    <MacroTile label="Carbs"   value={totals.carbohydrate_g} unit="g" accent="from-sky-400 to-blue-500" />
                    <MacroTile label="Fat"     value={totals.fat_g}          unit="g" accent="from-teal-400 to-cyan-500" />
                  </div>
                );
              })()}

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
                    <DetectedItemRow
                      key={item.id}
                      item={item}
                      grams={portions[item.id] ?? item.portion_g}
                      onGrams={(g) => setPortions((p) => ({ ...p, [item.id]: g }))}
                    />
                  ))}
                </ul>
              </Glass>

              {/* Insight - shown once the meal is logged */}
              {logged?.insight && <InsightPanel plate={logged} />}

              {/* Log to history */}
              {logged ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-foreground/10 px-5 py-3 text-sm font-medium hover:bg-foreground/[0.04]"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Snap another
                  </button>
                  <div className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500/10 px-5 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Logged · sent for review
                  </div>
                </div>
              ) : (
                <Glass className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Meal</span>
                    {/* w-auto: the native select sized to its content, but
                        SelectTrigger defaults to w-full and would stretch
                        across this flex row. */}
                    <Select
                      value={mealType}
                      onValueChange={(v) => setMealType(v as MealType)}
                    >
                      <SelectTrigger
                        aria-label="Meal"
                        className="h-auto w-auto gap-1.5 rounded-lg border-foreground/[0.1] bg-transparent px-2.5 py-1.5 text-sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEAL_TYPES.map((mt) => (
                          <SelectItem key={mt} value={mt}>{MEAL_TYPE_LABEL[mt]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={reset}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-foreground/10 px-5 py-3 text-sm font-medium hover:bg-foreground/[0.04]"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Snap another
                    </button>
                    <button
                      type="button"
                      disabled={logMut.isPending}
                      onClick={() => logMut.mutate(result)}
                      className={cn(
                        'flex-1 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-white',
                        'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]',
                        logMut.isPending && 'opacity-70',
                      )}
                    >
                      {logMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Log this meal
                    </button>
                  </div>
                  <p className="text-[11px] text-foreground/50">
                    Logging re-checks every food against the database and saves a traceable nutrition snapshot your nutritionist can review.
                  </p>
                </Glass>
              )}
            </motion.div>
          )}
        </AnimatePresence>
          </div>

          {/* Side panel - capture guidance + how it works */}
          <motion.aside variants={fadeUp} className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <GoodPhotoTips />
            <HowItWorks />
          </motion.aside>
        </div>
      </motion.div>

      <AnimatePresence>
        {cameraOpen && (
          <CameraCapture
            onCapture={(f) => handleFile(f)}
            onClose={() => setCameraOpen(false)}
            onPickFile={() => inputRef.current?.click()}
          />
        )}
      </AnimatePresence>
    </ClientLayout>
  );
}

// ────────────────────────────────────────────────────────────────────

/**
 * Downscale an image File to a small JPEG data URL (~40-80 KB) for the meal
 * history thumbnail. The full-size photo is only used for analysis, not stored.
 */
async function makeThumbnail(file: File, max = 480): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error('read failed'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('decode failed'));
    i.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.7);
}

function GoodPhotoTips() {
  const tips: Array<{ icon: typeof Camera; text: string }> = [
    { icon: Camera, text: 'Shoot top-down so every item is visible.' },
    { icon: Lightbulb, text: 'Good, even light - avoid harsh shadows.' },
    { icon: Utensils, text: 'One plate per photo gives the cleanest read.' },
    { icon: CheckCircle2, text: 'Fill the frame; keep the whole meal in view.' },
  ];
  return (
    <Glass className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Camera className="h-4 w-4 text-teal-600 dark:text-teal-300" />
        <span className="text-sm font-medium">Tips for a good photo</span>
      </div>
      <ul className="space-y-2.5">
        {tips.map((t) => (
          <li key={t.text} className="flex items-start gap-2.5 text-sm text-foreground/70">
            <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg bg-foreground/[0.04] text-foreground/55">
              <t.icon className="h-3.5 w-3.5" />
            </span>
            {t.text}
          </li>
        ))}
      </ul>
    </Glass>
  );
}

function HowItWorks() {
  const steps = [
    'Gemini identifies foods, portions, and cooking method - no guessed numbers.',
    'The Nutrition Engine looks up each food in IFCT 2017 / USDA.',
    'Anything it can\'t match confidently is flagged for review - never fabricated.',
  ];
  return (
    <Glass className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
        <span className="text-sm font-medium">How the numbers are made</span>
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-foreground/70">
            <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)] text-[11px] font-semibold tabular-nums text-teal-700 dark:text-teal-300">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-foreground/45">
        <BookOpen className="h-3 w-3" />
        Every logged item keeps a traceable audit trail.
      </p>
    </Glass>
  );
}

// ────────────────────────────────────────────────────────────────────

function DetectedItemRow({ item, grams, onGrams }: { item: DetectedItem; grams: number; onGrams: (g: number) => void }) {
  const [showIngredients, setShowIngredients] = useState(false);
  const foodName = item.resolved && item.food ? item.food.canonical_name : item.detected_name;
  // Nutrition scales linearly with grams for a resolved food.
  const factor = item.portion_g > 0 ? grams / item.portion_g : 1;
  const sc = (v: number) => Math.round(v * factor);
  const edited = grams !== item.portion_g;

  const ingredientsQ = useQuery({
    queryKey: ['ingredients', foodName, item.food?.category],
    queryFn: () => nutritionApi.ingredients(foodName, item.food?.category),
    enabled: showIngredients && !!foodName,
    staleTime: 30 * 60 * 1000,
  });

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium">
              {foodName}
            </div>
            <ConfidenceBadge confidence={item.ai_confidence} />
          </div>
          <div className="mt-0.5 text-xs text-foreground/55">
            {grams}g · {item.cooking_method.replace(/_/g, ' ')}
            {item.resolved && item.food?.source_id && (
              <span className="ml-2 text-foreground/40">· {item.food.source} {item.food.source_id}</span>
            )}
          </div>
          {item.nutrients && (
            <div className="mt-1 text-xs text-foreground/65">
              P {sc(item.nutrients.protein_g)}g · C {sc(item.nutrients.carbohydrate_g)}g · F {sc(item.nutrients.fat_g)}g
              {item.nutrients.fiber_g != null && <> · Fiber {sc(item.nutrients.fiber_g)}g</>}
            </div>
          )}

          {/* Drag to correct the AI's portion estimate - numbers recompute live. */}
          {item.nutrients && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="range"
                min={10}
                max={Math.max(400, Math.round(item.portion_g * 2.5))}
                step={5}
                value={grams}
                onChange={(e) => onGrams(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-teal-500"
                aria-label={`Adjust ${foodName} portion in grams`}
              />
              <span className="w-11 text-right text-xs tabular-nums text-foreground/70">{grams}g</span>
              {edited && (
                <button
                  type="button"
                  onClick={() => onGrams(item.portion_g)}
                  className="text-[10px] font-medium text-teal-600 hover:underline dark:text-teal-300"
                >
                  reset
                </button>
              )}
            </div>
          )}

          {/* Ingredients (typical recipe) - fetched on demand */}
          <button
            type="button"
            onClick={() => setShowIngredients((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-300"
          >
            <Utensils className="h-3 w-3" />
            {showIngredients ? 'Hide ingredients' : 'Show ingredients'}
            <ChevronDown className={cn('h-3 w-3 transition-transform', showIngredients && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {showIngredients && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 rounded-lg bg-foreground/[0.03] p-2.5">
                  {ingredientsQ.isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-foreground/55">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up ingredients…
                    </div>
                  ) : ingredientsQ.data?.ingredients.length ? (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {ingredientsQ.data.ingredients.map((ing) => (
                          <span key={ing} className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] text-foreground/75">
                            {ing}
                          </span>
                        ))}
                      </div>
                      {ingredientsQ.data.note && (
                        <div className="mt-1.5 text-[10px] text-foreground/40">{ingredientsQ.data.note}</div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-foreground/50">
                      {ingredientsQ.isError ? 'Could not load ingredients.' : 'Ingredients vary by recipe.'}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!item.resolved && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              Couldn't match to a database food - tap to clarify
            </div>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          {item.nutrients ? (
            <div className="text-sm font-semibold tabular-nums">
              {sc(item.nutrients.energy_kcal)}
              <span className="ml-0.5 text-[10px] font-normal text-foreground/55">kcal</span>
            </div>
          ) : (
            <div className="text-xs text-foreground/45">-</div>
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

function InsightPanel({ plate }: { plate: PlateMeal }) {
  const insight = plate.insight!;
  return (
    <AIGlow intensity="soft" animated>
      <Glass variant="heavy" className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500 dark:text-amber-300" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">NUSI insight</div>
              {insight.score != null && (
                <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] tabular-nums text-foreground/65">
                  balance {insight.score}/100
                </span>
              )}
              <span className="text-[9px] uppercase tracking-[0.14em] text-foreground/40">
                {insight.source === 'ai' ? 'AI' : 'rule-based'}
              </span>
            </div>
            <p className="mt-1 text-sm text-foreground/75">{insight.summary}</p>
          </div>
        </div>

        {/* Macro balance chips */}
        <div className="flex flex-wrap gap-2">
          {(['protein', 'carbohydrate', 'fat'] as const).map((k) => (
            <span
              key={k}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] capitalize',
                insight.macro_balance[k] === 'high'
                  ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                  : insight.macro_balance[k] === 'low'
                    ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                    : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
              )}
            >
              {k}: {insight.macro_balance[k]}
            </span>
          ))}
        </div>

        {insight.suggestions.length > 0 && (
          <ul className="space-y-1">
            {insight.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/70">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-teal-500" />
                {s}
              </li>
            ))}
          </ul>
        )}
      </Glass>
    </AIGlow>
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
