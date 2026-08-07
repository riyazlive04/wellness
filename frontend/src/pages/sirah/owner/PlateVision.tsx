import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { UploadZone } from '@/modules/workspace/plate-vision/components/UploadZone';
import { PlateCanvas } from '@/modules/workspace/plate-vision/components/PlateCanvas';
import { FoodItemCard } from '@/modules/workspace/plate-vision/components/FoodItemCard';
import { NutritionTotal } from '@/modules/workspace/plate-vision/components/NutritionTotal';
import type { DetectedItem, ScanResult, ScanState, SamplePlate } from '@/modules/workspace/plate-vision/types';
import { analyzePlate } from '@/modules/workspace/plate-vision/api';
import { ApiError } from '@/lib/api';

const SCAN_STAGES = [
  'Preparing image…',
  'Detecting foods…',
  'Estimating portions…',
  'Matching IFCT + USDA databases…',
  'Finalizing nutrition…',
];

export default function OwnerPlateVision() {
  const workspace = readWorkspace();
  const [state, setState] = useState<ScanState>('idle');
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fallbackColor, setFallbackColor] = useState<string | undefined>();

  // Advance the scan stage label while scanning
  useEffect(() => {
    if (state !== 'scanning') return;
    setStage(0);
    const id = setInterval(() => {
      setStage((s) => Math.min(s + 1, SCAN_STAGES.length - 1));
    }, 500);
    return () => clearInterval(id);
  }, [state]);

  function startScanFromSample(plate: SamplePlate) {
    setResult({ imageUrl: plate.imageUrl, items: plate.items });
    setFallbackColor(plate.fallbackColor);
    setSelectedId(null);
    setState('scanning');
    // Show "scanning" for ~2.6s, then jump to results
    window.setTimeout(() => setState('results'), 2600);
  }

  async function startScanFromUpload(imageUrl: string, file: File) {
    // Show the user's image immediately while Gemini works.
    setResult({ imageUrl, items: [] });
    setFallbackColor(undefined);
    setSelectedId(null);
    setState('scanning');

    try {
      const response = await analyzePlate(file);
      if (response.items.length === 0) {
        toast('No foods detected. Try a clearer photo with the plate centred.');
        setState('idle');
        setResult(null);
        return;
      }
      setResult({ imageUrl, items: response.items });
      setState('results');
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? e.message
          : 'Could not analyse this image. Try again or pick a sample below.';
      toast.error(msg);
      setState('idle');
      setResult(null);
    }
  }

  function reset() {
    setState('idle');
    setResult(null);
    setSelectedId(null);
    setStage(0);
  }

  function updateItem(next: DetectedItem) {
    if (!result) return;
    setResult({
      ...result,
      items: result.items.map((it) => (it.id === next.id ? next : it)),
    });
  }

  function logAsMeal() {
    toast.success('Meal logged. (Wires to the meal_logs API when the backend boots.)');
  }

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext="Plate Vision · powered by GPT-4o + IFCT + USDA"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-6">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-200">
                <Sparkles className="h-3 w-3" />
                Plate Vision AI
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Snap a plate, get nutrition.
              </h1>
              <p className="mt-1 max-w-xl text-sm text-foreground/75 dark:text-foreground/55">
                NUSI detects foods, estimates portions, and matches them against IFCT (Indian)
                and USDA nutrition databases - with confidence scores you can audit.
              </p>
            </div>

            {state === 'results' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Try another
                </button>
                <button
                  type="button"
                  onClick={logAsMeal}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-foreground transition-transform duration-200 hover:scale-[1.02] cta-glow active:scale-[0.97]"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Log as meal
                </button>
              </div>
            )}
          </motion.div>

          {/* Body */}
          <AnimatePresence mode="wait">
            {state === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <UploadZone onPickSample={startScanFromSample} onUpload={startScanFromUpload} />
              </motion.div>
            )}

            {(state === 'scanning' || state === 'results') && result && (
              <motion.div
                key="active"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
              >
                {/* Left: image + scan */}
                <div className="space-y-3">
                  <div className="relative">
                    <PlateCanvas
                      imageUrl={result.imageUrl}
                      fallbackColor={fallbackColor}
                      items={result.items}
                      state={state}
                      selectedId={selectedId}
                      onSelect={(id) => setSelectedId((curr) => (curr === id ? null : id))}
                    />
                  </div>

                  {/* Stage strip - visible during scanning */}
                  {state === 'scanning' && (
                    <Glass className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700 dark:text-teal-300" />
                        <span className="text-sm text-foreground/85">{SCAN_STAGES[stage]}</span>
                        <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                          GPT-4o Vision
                        </span>
                      </div>
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.04]">
                        <motion.div
                          className="h-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]"
                          initial={{ width: '0%' }}
                          animate={{ width: `${((stage + 1) / SCAN_STAGES.length) * 100}%` }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                        />
                      </div>
                    </Glass>
                  )}

                  {/* Tip strip - visible in results */}
                  {state === 'results' && (
                    <AIGlow intensity="soft" animated={false}>
                      <Glass variant="heavy" className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)]">
                            <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-200" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                              NUSI coach note
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-foreground/75">
                              Tap any bounding box to highlight the matching item. Adjust portion
                              with +/-, or click the pencil to rename. Macros update live.
                            </p>
                          </div>
                        </div>
                      </Glass>
                    </AIGlow>
                  )}
                </div>

                {/* Right: items + totals */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                      Detected items
                    </div>
                    <div className="text-xs text-foreground/75 dark:text-foreground/60">
                      {state === 'scanning' ? 'Analyzing…' : `${result.items.length} items`}
                    </div>
                  </div>

                  {state === 'scanning' ? (
                    <ScanningSkeleton count={result.items.length} />
                  ) : (
                    <div className="space-y-2">
                      {result.items.map((item) => (
                        <FoodItemCard
                          key={item.id}
                          item={item}
                          selected={selectedId === item.id}
                          onSelect={() => setSelectedId((curr) => (curr === item.id ? null : item.id))}
                          onUpdate={updateItem}
                        />
                      ))}
                    </div>
                  )}

                  {/* Totals - only after scan */}
                  {state === 'results' && <NutritionTotal items={result.items} />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer hint, only idle */}
          {state === 'idle' && (
            <motion.div variants={fadeUp} className="text-center text-[11px] text-foreground/35">
              Your photos stay private to your workspace · Plate Vision runs on the backend ·{' '}
              <a href="#" className="text-foreground/75 dark:text-foreground/60 hover:text-foreground">
                How accuracy works
              </a>
            </motion.div>
          )}
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

// ─── Skeleton during scan ────────────────────────────────────────────────

function ScanningSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Glass key={i} className="overflow-hidden p-4">
          <div className="space-y-3">
            <div className="flex justify-between">
              <div className="h-3 w-40 animate-pulse rounded bg-foreground/[0.06]" />
              <div className="h-3 w-12 animate-pulse rounded bg-foreground/[0.06]" />
            </div>
            <div className="h-2 w-24 animate-pulse rounded bg-foreground/[0.04]" />
            <div className="flex items-center gap-3">
              <div className="h-6 w-20 animate-pulse rounded-full bg-foreground/[0.06]" />
              <div className="h-3 w-32 animate-pulse rounded bg-foreground/[0.04]" />
            </div>
          </div>
        </Glass>
      ))}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}

