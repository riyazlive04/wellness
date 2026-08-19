import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Sparkles, Upload, RotateCcw, Loader2, X, Wand2, BookOpen, Lightbulb, CheckCircle2, ChevronDown, Utensils, Info, Ruler } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { CameraCapture } from '@/modules/client/CameraCapture';
import {
  clientsApi,
  type AnalyzedItem, type AnalyzeHints, type PlateAnalysis,
} from '@/modules/workspace/api/clients';
import { nutritionApi } from '@/modules/workspace/api/nutrition';
import {
  plateVisionApi, mealTypeForNow, MEAL_TYPES, MEAL_TYPE_LABEL,
  type MealType, type PlateMeal,
} from '@/modules/workspace/api/plate-vision';
import { cn } from '@/lib/utils';

/**
 * Plate Vision — photograph a meal, get a dish-level nutrition breakdown.
 *
 * POST /api/v1/vision/analyze returns the model's reading of the plate: the
 * dish it recognised, the foods it broke that into, and estimated nutrition
 * per food.
 *
 * ⚠️ Those numbers are ESTIMATES from a photo — not IFCT/USDA lookups, not
 * reproducible, no audit trail. This screen's job is to be useful without
 * overstating them, which means three things it must never stop doing:
 *   1. show `calories_range`, not just the point estimate;
 *   2. label the source as an estimate wherever a total appears;
 *   3. make correcting the dish and the portions genuinely easy, because user
 *      correction is the only accuracy lever available here.
 */

/** Grams the user has overridden, keyed by item index. Empty = model's estimate. */
type PortionEdits = Record<number, number>;

/**
 * Scale one item's nutrition to an edited gram weight.
 *
 * The model reports nutrition FOR THE PORTION IT ESTIMATED, so a correction is
 * a linear rescale from that baseline. A zero-gram estimate has no baseline to
 * scale from, so it is left alone rather than divided by zero.
 */
function scaleItem(item: AnalyzedItem, grams: number): AnalyzedItem {
  if (item.grams <= 0) return { ...item, grams };
  const f = grams / item.grams;
  const r1 = (v: number) => Math.round(v * f * 10) / 10;
  return {
    ...item,
    grams,
    calories_kcal: Math.round(item.calories_kcal * f),
    protein_g: r1(item.protein_g),
    carbs_g: r1(item.carbs_g),
    fat_g: r1(item.fat_g),
    fiber_g: r1(item.fiber_g),
    sugar_g: r1(item.sugar_g),
    sodium_mg: Math.round(item.sodium_mg * f),
  };
}

/** The items as they currently stand, with any portion edits applied. */
function effectiveItems(result: PlateAnalysis, edits: PortionEdits): AnalyzedItem[] {
  return result.items.map((it, i) => (edits[i] != null ? scaleItem(it, edits[i]) : it));
}

/**
 * Recompute totals from the (possibly edited) items.
 *
 * The calorie band is carried over as a PROPORTION of the original rather than
 * a fixed ±kcal, so a halved portion gets a proportionally narrower band
 * instead of the original one, which would be absurdly wide against the new
 * number.
 */
function computeTotals(result: PlateAnalysis, edits: PortionEdits) {
  const items = effectiveItems(result, edits);
  const sum = (k: keyof AnalyzedItem) =>
    Math.round(items.reduce((a, it) => a + (Number(it[k]) || 0), 0) * 10) / 10;

  const calories = Math.round(sum('calories_kcal'));
  const base = result.totals.calories_kcal;
  const lo = base > 0 ? Math.min(0.5, Math.max(0.05, (base - result.totals.calories_range.min) / base)) : 0.15;
  const hi = base > 0 ? Math.min(0.5, Math.max(0.05, (result.totals.calories_range.max - base) / base)) : 0.15;

  return {
    calories_kcal: calories,
    calories_range: {
      min: Math.round(calories * (1 - lo)),
      max: Math.round(calories * (1 + hi)),
    },
    protein_g: sum('protein_g'),
    carbs_g: sum('carbs_g'),
    fat_g: sum('fat_g'),
    fiber_g: sum('fiber_g'),
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
  const [edits, setEdits] = useState<PortionEdits>({});
  // Capture hints. These reach the prompt and measurably move the estimate, so
  // they are offered before the scan rather than buried behind a toggle.
  const [portion, setPortion] = useState<AnalyzeHints['portion']>(undefined);
  const [scaleRef, setScaleRef] = useState(false);
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const analyzeMut = useMutation<PlateAnalysis, Error, { file: File; correction?: string }>({
    mutationFn: ({ file: f, correction }) =>
      clientsApi.analyzePlate(f, { portion, scale_ref: scaleRef, hint: note, correction }),
    onSuccess: () => setEdits({}),
    onError: (err) => toast.error(err.message ?? t('toast.analyzeError')),
  });
  const result = analyzeMut.data;

  const logMut = useMutation<PlateMeal, Error, PlateAnalysis>({
    mutationFn: async (r) => {
      // The thumbnail is generated asynchronously when the photo is picked, so
      // it may not be ready by the time the user taps "Log". Generate it now if
      // needed so the meal always carries its photo for the nutritionist review.
      const photo = thumbUrl ?? (file ? await makeThumbnail(file).catch(() => null) : null);
      const items = effectiveItems(r, edits);
      return plateVisionApi.log({
        meal_type: mealType,
        source: 'plate_vision',
        photo_url: photo ?? undefined,
        // Tells the server not to re-run the engine, and stamps the plate so
        // the review queue can show these as estimates.
        nutrition_source: 'ai_estimate',
        analysis: {
          dish_name: r.dish_name,
          cuisine: r.cuisine,
          confidence: r.confidence,
          alternatives: r.alternatives,
          assumptions: r.assumptions,
          health_notes: r.health_notes,
          calories_range: computeTotals(r, edits).calories_range,
        },
        items: items.map((it) => ({
          detected_name: it.name,
          quantity_g: Math.max(1, Math.round(it.grams)),
          nutrition: {
            calories_kcal: it.calories_kcal,
            protein_g: it.protein_g,
            carbs_g: it.carbs_g,
            fat_g: it.fat_g,
            fiber_g: it.fiber_g,
            sugar_g: it.sugar_g,
            sodium_mg: it.sodium_mg,
          },
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
    setEdits({});
    analyzeMut.reset();
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setThumbUrl(null);
    setLogged(null);
    setEdits({});
    setPortion(undefined);
    setScaleRef(false);
    setNote('');
    analyzeMut.reset();
    logMut.reset();
    if (inputRef.current) inputRef.current.value = '';
  }

  /** Re-run the scan with the user's correction as ground truth. */
  function correctDish(dishName: string) {
    if (!file || !dishName.trim()) return;
    analyzeMut.mutate({ file, correction: dishName.trim() });
  }

  const totals = result ? computeTotals(result, edits) : null;

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
                <div className="space-y-4 border-t border-foreground/[0.06] p-4">
                  <HintControls
                    portion={portion}
                    onPortion={setPortion}
                    scaleRef={scaleRef}
                    onScaleRef={setScaleRef}
                    note={note}
                    onNote={setNote}
                  />
                  <button
                    type="button"
                    onClick={() => file && analyzeMut.mutate({ file })}
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
                    <div className="text-sm font-medium">
                      {result ? t('alternatives.reanalyzing') : t('capture.analyzingTitle')}
                    </div>
                    <div className="text-xs text-foreground/55">{t('capture.analyzingHint')}</div>
                  </div>
                </div>
              )}
            </Glass>
          )}
        </motion.div>

        {/* Result */}
        <AnimatePresence>
          {result && totals && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {result.not_food ? (
                <Glass variant="heavy" className="flex items-start gap-3 p-4">
                  <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-300" />
                  <div className="text-sm text-foreground/75">{t('provenance.notFood')}</div>
                </Glass>
              ) : (
                <>
                  <DishHeader result={result} totals={totals} />

                  {/* Correction is the main accuracy lever on this screen, so it
                      sits directly under the identification rather than at the
                      bottom of the page. */}
                  <DishCorrection
                    alternatives={result.alternatives}
                    disabled={analyzeMut.isPending}
                    onCorrect={correctDish}
                  />

                  <div className="grid grid-cols-4 gap-2">
                    <MacroTile label="kcal"             value={totals.calories_kcal} accent="from-amber-400 to-orange-500" />
                    <MacroTile label={t('macros.protein')} value={totals.protein_g} unit="g" accent="from-rose-400 to-pink-500" />
                    <MacroTile label={t('macros.carbs')}   value={totals.carbs_g}   unit="g" accent="from-sky-400 to-blue-500" />
                    <MacroTile label={t('macros.fat')}     value={totals.fat_g}     unit="g" accent="from-teal-400 to-cyan-500" />
                  </div>

                  {/* Items */}
                  <Glass className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                        {t('detected.heading')}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">
                        {result.provenance.ai_model} · {t('detected.estimated')}
                      </div>
                    </div>
                    <ul className="divide-y divide-foreground/[0.05]">
                      {result.items.map((item, i) => (
                        <AnalyzedItemRow
                          key={`${item.name}-${i}`}
                          item={item}
                          grams={edits[i] ?? item.grams}
                          onGrams={(g) => setEdits((p) => ({ ...p, [i]: g }))}
                          onReset={() => setEdits(({ [i]: _drop, ...rest }) => rest)}
                        />
                      ))}
                    </ul>
                  </Glass>

                  {(result.assumptions.length > 0 || result.health_notes.length > 0) && (
                    <NotesPanel assumptions={result.assumptions} healthNotes={result.health_notes} />
                  )}
                </>
              )}

              {/* Insight - shown once the meal is logged */}
              {logged?.insight && <InsightPanel plate={logged} />}

              {/* Log to history */}
              {!result.not_food && (logged ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-foreground/10 px-5 py-3 text-sm font-medium hover:bg-foreground/[0.04]"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t('log.snapAnother')}
                  </button>
                  <div className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500/10 px-5 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    {t('log.loggedReview')}
                  </div>
                </div>
              ) : (
                <Glass className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t('log.mealLabel')}</span>
                    {/* w-auto: the native select sized to its content, but
                        SelectTrigger defaults to w-full and would stretch
                        across this flex row. */}
                    <Select
                      value={mealType}
                      onValueChange={(v) => setMealType(v as MealType)}
                    >
                      <SelectTrigger
                        aria-label={t('log.mealLabel')}
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
                      {t('log.snapAnother')}
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
                      {t('log.logMeal')}
                    </button>
                  </div>
                  <p className="text-[11px] text-foreground/50">
                    {t('log.logNote')}
                  </p>
                </Glass>
              ))}
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

/**
 * Pre-scan hints. Worth the extra tap: `portion` alone shifts the gram estimate
 * by a measured -31% / +40%, which is far larger than any correction the user
 * would make by dragging sliders afterwards.
 */
function HintControls({
  portion, onPortion, scaleRef, onScaleRef, note, onNote,
}: {
  portion: AnalyzeHints['portion'];
  onPortion: (p: AnalyzeHints['portion']) => void;
  scaleRef: boolean;
  onScaleRef: (v: boolean) => void;
  note: string;
  onNote: (v: string) => void;
}) {
  const { t } = useTranslation('clientPlateVision');
  const options: Array<{ value: AnalyzeHints['portion']; label: string }> = [
    { value: undefined, label: t('hints.portion.unset') },
    { value: 'small',   label: t('hints.portion.small') },
    { value: 'medium',  label: t('hints.portion.medium') },
    { value: 'large',   label: t('hints.portion.large') },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t('hints.heading')}</span>
        <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-foreground/45">
          {t('hints.optional')}
        </span>
      </div>

      <div>
        <div className="mb-1.5 text-xs text-foreground/65">{t('hints.portionLabel')}</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('hints.portionLabel')}>
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={portion === o.value}
              onClick={() => onPortion(o.value)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs transition-colors',
                portion === o.value
                  ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white'
                  : 'border border-foreground/10 hover:bg-foreground/[0.04]',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-foreground/45">{t('hints.portionHelp')}</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={scaleRef}
          onChange={(e) => onScaleRef(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-teal-500"
        />
        <span>
          <span className="flex items-center gap-1.5 text-xs">
            <Ruler className="h-3.5 w-3.5 text-foreground/55" />
            {t('hints.scaleRef')}
          </span>
          <span className="mt-0.5 block text-[11px] text-foreground/45">{t('hints.scaleRefHelp')}</span>
        </span>
      </label>

      <div>
        <label htmlFor="plate-note" className="mb-1.5 block text-xs text-foreground/65">
          {t('hints.noteLabel')}
        </label>
        <input
          id="plate-note"
          type="text"
          value={note}
          maxLength={300}
          onChange={(e) => onNote(e.target.value)}
          placeholder={t('hints.notePlaceholder')}
          className="w-full rounded-lg border border-foreground/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/25"
        />
      </div>
    </div>
  );
}

/** Identification + the honest headline: a range, not a single number. */
function DishHeader({
  result, totals,
}: {
  result: PlateAnalysis;
  totals: { calories_kcal: number; calories_range: { min: number; max: number } };
}) {
  const { t } = useTranslation('clientPlateVision');
  const tone =
    result.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    : result.confidence === 'medium' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300';

  return (
    <AIGlow intensity="soft" animated>
      <Glass variant="heavy" className="p-4">
        <div className="flex items-start gap-3">
          <Wand2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-600 dark:text-teal-300" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">{result.dish_name}</span>
              {result.cuisine && (
                <span className="text-xs text-foreground/55">{result.cuisine}</span>
              )}
              <span className={cn('rounded-full px-2 py-0.5 text-[10px]', tone)}>
                {t(`provenance.confidence.${result.confidence}`)}
              </span>
            </div>

            <div className="mt-1 text-xs uppercase tracking-[0.14em] text-foreground/45">
              {t('provenance.estimateTitle')}
            </div>

            {/* The band is the point. A single number here would read as measured. */}
            <div className="mt-1.5 text-sm text-foreground/75 tabular-nums">
              {t('provenance.rangeLabel', {
                min: totals.calories_range.min,
                max: totals.calories_range.max,
              })}
            </div>

            <div className="mt-2 text-xs text-foreground/60">{t('provenance.note')}</div>
          </div>
        </div>
      </Glass>
    </AIGlow>
  );
}

/**
 * One-tap dish correction. The model already tells us which dishes it ruled
 * out and why, so the cheapest fix for a wrong read is to offer those back
 * rather than making the user describe the meal from scratch.
 */
function DishCorrection({
  alternatives, disabled, onCorrect,
}: {
  alternatives: PlateAnalysis['alternatives'];
  disabled: boolean;
  onCorrect: (dish: string) => void;
}) {
  const { t } = useTranslation('clientPlateVision');
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  return (
    <Glass className="space-y-2.5 p-4">
      <div>
        <div className="text-sm font-medium">{t('alternatives.heading')}</div>
        <div className="text-[11px] text-foreground/50">{t('alternatives.help')}</div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {alternatives.map((alt) => (
          <button
            key={alt.dish_name}
            type="button"
            disabled={disabled}
            onClick={() => onCorrect(alt.dish_name)}
            title={alt.note}
            className="rounded-full border border-foreground/10 px-3 py-1.5 text-xs hover:bg-foreground/[0.04] disabled:opacity-50"
          >
            {alt.dish_name}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowCustom((v) => !v)}
          className="rounded-full border border-dashed border-foreground/15 px-3 py-1.5 text-xs hover:bg-foreground/[0.04] disabled:opacity-50"
        >
          {t('alternatives.otherLabel')}
        </button>
      </div>

      {showCustom && (
        <div className="flex gap-2">
          <input
            type="text"
            value={custom}
            maxLength={200}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCorrect(custom)}
            placeholder={t('alternatives.otherPlaceholder')}
            className="flex-1 rounded-lg border border-foreground/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/25"
          />
          <button
            type="button"
            disabled={disabled || !custom.trim()}
            onClick={() => onCorrect(custom)}
            className="rounded-lg bg-foreground/[0.06] px-3 py-2 text-xs font-medium hover:bg-foreground/[0.1] disabled:opacity-40"
          >
            {t('alternatives.apply')}
          </button>
        </div>
      )}
    </Glass>
  );
}

/** What the model assumed, and anything it flagged. Both are prompt outputs. */
function NotesPanel({ assumptions, healthNotes }: { assumptions: string[]; healthNotes: string[] }) {
  const { t } = useTranslation('clientPlateVision');
  return (
    <Glass className="space-y-3 p-4">
      {assumptions.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            <Info className="h-3 w-3" />
            {t('provenance.assumptionsHeading')}
          </div>
          <ul className="space-y-1">
            {assumptions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/65">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-foreground/30" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
      {healthNotes.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            <Lightbulb className="h-3 w-3" />
            {t('provenance.healthHeading')}
          </div>
          <ul className="space-y-1">
            {healthNotes.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/65">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-teal-500" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Glass>
  );
}

function GoodPhotoTips() {
  const { t } = useTranslation('clientPlateVision');
  const tips: Array<{ icon: typeof Camera; text: string }> = [
    { icon: Camera,        text: t('tips.topDown') },
    { icon: Lightbulb,     text: t('tips.light') },
    { icon: Utensils,      text: t('tips.onePlate') },
    { icon: CheckCircle2,  text: t('tips.fillFrame') },
    { icon: Ruler,         text: t('tips.scaleObject') },
  ];
  return (
    <Glass className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Camera className="h-4 w-4 text-teal-600 dark:text-teal-300" />
        <span className="text-sm font-medium">{t('tips.heading')}</span>
      </div>
      <ul className="space-y-2.5">
        {tips.map((tip) => (
          <li key={tip.text} className="flex items-start gap-2.5 text-sm text-foreground/70">
            <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg bg-foreground/[0.04] text-foreground/55">
              <tip.icon className="h-3.5 w-3.5" />
            </span>
            {tip.text}
          </li>
        ))}
      </ul>
    </Glass>
  );
}

function HowItWorks() {
  const { t } = useTranslation('clientPlateVision');
  const steps = [t('how.step1'), t('how.step2'), t('how.step3')];
  return (
    <Glass className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-teal-600 dark:text-teal-300" />
        <span className="text-sm font-medium">{t('how.heading')}</span>
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
        {t('how.estimateFooter')}
      </p>
    </Glass>
  );
}

// ────────────────────────────────────────────────────────────────────

function AnalyzedItemRow({
  item, grams, onGrams, onReset,
}: {
  item: AnalyzedItem;
  grams: number;
  onGrams: (g: number) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation('clientPlateVision');
  const [showIngredients, setShowIngredients] = useState(false);
  const scaled = scaleItem(item, grams);
  const edited = grams !== item.grams;

  const ingredientsQ = useQuery({
    queryKey: ['ingredients', item.name],
    queryFn: () => nutritionApi.ingredients(item.name),
    enabled: showIngredients && !!item.name,
    staleTime: 30 * 60 * 1000,
  });

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.name}</div>
          <div className="mt-0.5 text-xs text-foreground/55">
            {Math.round(grams)}g
            {item.estimated_portion && <span className="ml-1.5 text-foreground/40">· {item.estimated_portion}</span>}
          </div>
          <div className="mt-1 text-xs text-foreground/65">
            P {scaled.protein_g}g · C {scaled.carbs_g}g · F {scaled.fat_g}g
            {scaled.fiber_g > 0 && <> · {t('detected.fiber')} {scaled.fiber_g}g</>}
          </div>

          {/* Drag to correct the portion - every macro recomputes live. */}
          <div className="mt-2 flex items-center gap-2">
            <input
              type="range"
              min={10}
              max={Math.max(400, Math.round(item.grams * 2.5))}
              step={5}
              value={grams}
              onChange={(e) => onGrams(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer accent-teal-500"
              aria-label={t('detected.adjustPortion', { food: item.name })}
            />
            <span className="w-11 text-right text-xs tabular-nums text-foreground/70">{Math.round(grams)}g</span>
            {edited && (
              <button
                type="button"
                onClick={onReset}
                className="text-[10px] font-medium text-teal-600 hover:underline dark:text-teal-300"
              >
                {t('detected.resetPortion')}
              </button>
            )}
          </div>

          {/* Ingredients (typical recipe) - fetched on demand */}
          <button
            type="button"
            onClick={() => setShowIngredients((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-300"
          >
            <Utensils className="h-3 w-3" />
            {showIngredients ? t('detected.hideIngredients') : t('detected.showIngredients')}
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
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('detected.lookingUpIngredients')}
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
                      {ingredientsQ.isError ? t('detected.ingredientsError') : t('detected.ingredientsVary')}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums">
            {scaled.calories_kcal}
            <span className="ml-0.5 text-[10px] font-normal text-foreground/55">kcal</span>
          </div>
          <div className="mt-0.5 text-[10px] text-foreground/35">{t('detected.estimated')}</div>
        </div>
      </div>
    </li>
  );
}

function InsightPanel({ plate }: { plate: PlateMeal }) {
  const { t } = useTranslation('clientPlateVision');
  const insight = plate.insight!;
  return (
    <AIGlow intensity="soft" animated>
      <Glass variant="heavy" className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500 dark:text-amber-300" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">{t('insight.title')}</div>
              {insight.score != null && (
                <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] tabular-nums text-foreground/65">
                  {t('insight.balanceScore', { score: insight.score })}
                </span>
              )}
              <span className="text-[9px] uppercase tracking-[0.14em] text-foreground/40">
                {insight.source === 'ai' ? 'AI' : t('insight.ruleBased')}
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
              {t(`insight.macroName.${k}`)}: {insight.macro_balance[k]}
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
