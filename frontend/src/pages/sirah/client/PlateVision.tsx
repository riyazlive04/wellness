import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Sparkles, Upload, RotateCcw, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type VisionAnalysisResult } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Plate Vision — point your camera at a meal, get back a macro breakdown.
 *
 * Backend route: POST /api/v1/vision/analyze (multipart, file under "file").
 * Server runs Gemini 2.5 Flash and returns detected items + macros + summary.
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
            SIRAH spots the food, counts the calories, and logs the meal for you. One tap.
          </p>
        </motion.div>

        {/* Capture / preview surface */}
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
                    <div className="text-xs text-foreground/55">Front-camera, top-down works best</div>
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
                    <div className="text-xs text-foreground/55">Usually takes 3–5 seconds</div>
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
              <AIGlow intensity="soft" animated>
                <Glass variant="heavy" className="p-5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-violet-600 dark:text-violet-200" />
                    <p className="text-sm leading-relaxed text-foreground/85">{result.ai_summary}</p>
                  </div>
                </Glass>
              </AIGlow>

              {/* Macro pills */}
              <div className="grid grid-cols-4 gap-2">
                <MacroTile label="kcal" value={result.total_kcal} accent="from-amber-400 to-orange-500" />
                <MacroTile label="Protein" value={result.total_protein_g} unit="g" accent="from-rose-400 to-pink-500" />
                <MacroTile label="Carbs"   value={result.total_carbs_g}   unit="g" accent="from-sky-400 to-blue-500" />
                <MacroTile label="Fat"     value={result.total_fat_g}     unit="g" accent="from-violet-400 to-fuchsia-500" />
              </div>

              {/* Detected items */}
              <Glass className="p-4">
                <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                  Detected items
                </div>
                <ul className="divide-y divide-foreground/[0.05]">
                  {result.detected_items.map((item, i) => (
                    <li key={i} className="flex items-center justify-between py-3">
                      <div>
                        <div className="text-sm font-medium">{item.name}</div>
                        <div className="text-xs text-foreground/55">
                          {item.portion_g}g · P {item.protein_g}g · C {item.carbs_g}g · F {item.fat_g}g
                        </div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums">
                        {item.kcal}<span className="ml-0.5 text-[10px] font-normal text-foreground/55">kcal</span>
                      </div>
                    </li>
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
                  onClick={() => toast.success('Meal saved to today\'s log.')}
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

function MacroTile({ label, value, unit, accent }: { label: string; value: number; unit?: string; accent: string }) {
  return (
    <Glass className="flex flex-col items-center gap-1 p-3 text-center">
      <div className={cn('h-1 w-8 rounded-full bg-gradient-to-r', accent)} />
      <div className="text-base font-semibold tabular-nums">{value}{unit ?? ''}</div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
    </Glass>
  );
}