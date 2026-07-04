import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ScanLine, X, Loader2, Check, Keyboard, ShieldCheck, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { barcodeApi, type BarcodeProduct } from '@/modules/client/barcodeApi';
import { cn } from '@/lib/utils';

interface Props { onClose: () => void; onLogged: () => void }

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'mid_morning', label: 'Mid-morning' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'evening_snack', label: 'Snack' },
  { value: 'dinner', label: 'Dinner' },
];

// BarcodeDetector isn't in the TS DOM lib yet.
type AnyWindow = Window & { BarcodeDetector?: new (opts?: { formats?: string[] }) => { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } };

/**
 * BarcodeScanner — scan a packaged-food barcode with the device camera (native
 * BarcodeDetector; falls back to manual entry), resolve it to nutrition, and log
 * it as a meal. Closes the everyday "log packaged food fast" gap.
 */
export function BarcodeScanner({ onClose, onLogged }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingRef = useRef<{ stop: () => void } | null>(null); // ZXing scanner controls (fallback path)
  const [mode, setMode] = useState<'scan' | 'product' | 'add'>('scan');
  const [manual, setManual] = useState('');
  const [looking, setLooking] = useState(false);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [grams, setGrams] = useState(100);
  const [mealType, setMealType] = useState('evening_snack');
  const [logging, setLogging] = useState(false);
  const [cameraOk, setCameraOk] = useState<boolean | null>(null);
  // "Add from label" fallback — when no database has the barcode.
  const [pendingBarcode, setPendingBarcode] = useState('');
  const [form, setForm] = useState({ name: '', brand: '', kcal: '', protein: '', carb: '', fat: '' });
  const [saving, setSaving] = useState(false);

  const detectorAvailable = typeof (window as AnyWindow).BarcodeDetector === 'function';

  // Camera + detection loop. Uses the native BarcodeDetector when present (fast,
  // Android/Chrome); otherwise falls back to ZXing (desktop, iOS Safari) so live
  // camera scanning works everywhere.
  useEffect(() => {
    if (mode !== 'scan') return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    (async () => {
      try {
        if (detectorAvailable) {
          const Detector = (window as AnyWindow).BarcodeDetector!;
          const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
          setCameraOk(true);
          interval = setInterval(async () => {
            if (!videoRef.current || looking) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes[0]?.rawValue) { if (interval) clearInterval(interval); void resolve(codes[0].rawValue); }
            } catch { /* frame not ready */ }
          }, 400);
        } else {
          // Lazy-load ZXing only when needed — keeps it out of the main bundle.
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
          if (cancelled || !videoRef.current) return;
          // Hint the retail formats + TRY_HARDER — meaningfully improves decode
          // rate on lower-quality (e.g. laptop) cameras.
          const hints = new Map<number, unknown>();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          const reader = new BrowserMultiFormatReader(hints);
          const controls = await reader.decodeFromConstraints(
            { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
            videoRef.current,
            (result) => {
              if (result && !cancelled) {
                zxingRef.current?.stop();
                zxingRef.current = null;
                void resolve(result.getText());
              }
            },
          );
          if (cancelled) { controls.stop(); return; }
          zxingRef.current = controls;
          setCameraOk(true);
        }
      } catch { setCameraOk(false); }
    })();

    return () => { cancelled = true; if (interval) clearInterval(interval); stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, detectorAvailable]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    zxingRef.current?.stop();
    zxingRef.current = null;
  }

  // Decode a barcode from an uploaded/photographed image — reliable on desktop
  // where the webcam can't focus. ZXing reads the still frame directly.
  async function scanFromFile(file: File) {
    setLooking(true);
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
      const hints = new Map<number, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      const url = URL.createObjectURL(file);
      try {
        const result = await reader.decodeFromImageUrl(url);
        void resolve(result.getText());
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setLooking(false);
      toast.error('No barcode found in that image — try a sharper, closer photo of just the barcode.');
    }
  }

  async function resolve(code: string) {
    setLooking(true);
    try {
      const p = await barcodeApi.lookup(code);
      stopCamera();
      setProduct(p);
      setMode('product');
    } catch {
      // Not in any database — let the user add it from the label. It gets cached
      // so the next person who scans it resolves instantly.
      stopCamera();
      setPendingBarcode((code || '').replace(/\D/g, ''));
      setForm({ name: '', brand: '', kcal: '', protein: '', carb: '', fat: '' });
      setMode('add');
      toast.message('Not in our database yet — add it from the label.');
    } finally {
      setLooking(false);
    }
  }

  async function saveManual() {
    const kcal = Number(form.kcal);
    if (!Number.isFinite(kcal) || kcal <= 0) { toast.error('Enter energy (kcal per 100g).'); return; }
    setSaving(true);
    try {
      const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
      const p = await barcodeApi.addManual({
        barcode: pendingBarcode,
        name: form.name.trim() || undefined,
        brand: form.brand.trim() || undefined,
        kcal_100g: kcal,
        protein_100g: num(form.protein),
        carb_100g: num(form.carb),
        fat_100g: num(form.fat),
      });
      setProduct(p);
      setMode('product');
      toast.success('Saved — it will resolve instantly next time.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function log() {
    if (!product) return;
    setLogging(true);
    try {
      const r = await barcodeApi.log({ barcode: product.barcode, mealType, servingGrams: grams });
      toast.success(`Logged ${r.meal_name ?? 'food'}${r.kcal ? ` · ${r.kcal} kcal` : ''}`);
      onLogged();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not log.');
    } finally {
      setLogging(false);
    }
  }

  function handleClose() { stopCamera(); onClose(); }

  const f = grams / 100;
  const kcal = product?.kcal_100g != null ? Math.round(product.kcal_100g * f) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-black/30" onClick={handleClose} />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full sm:max-w-md">
        <Glass variant="heavy" className="overflow-hidden p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b border-foreground/[0.08] px-5 py-4">
            <div className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-violet-500" /><span className="text-sm font-semibold">Scan a barcode</span></div>
            <button type="button" onClick={handleClose} className="rounded p-1 text-foreground/50 hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>

          {mode === 'scan' && (
            <div className="p-5">
              {cameraOk !== false ? (
                <div className="relative overflow-hidden rounded-2xl bg-black">
                  <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="h-28 w-56 rounded-xl border-2 border-white/70" />
                  </div>
                  {looking && <div className="absolute inset-0 grid place-items-center bg-black/40"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                </div>
              ) : null}
              {cameraOk !== false && (
                <p className="mt-2 text-center text-[11px] text-foreground/45">
                  Hold the barcode flat and well-lit, ~15&nbsp;cm away, filling the box. On a laptop this can be tricky — a phone scans far better.
                </p>
              )}
              {cameraOk === false && (
                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5 text-center text-xs text-foreground/60">
                  Camera unavailable (permission denied or no camera). Enter the barcode number below.
                </div>
              )}

              <div className="mt-4">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-foreground/55"><Keyboard className="h-3 w-3" /> Or type the barcode</div>
                <div className="flex gap-2">
                  <input value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="e.g. 3017620422003"
                    onKeyDown={(e) => { if (e.key === 'Enter' && manual.length >= 6) void resolve(manual); }}
                    className="h-10 flex-1 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-violet-400/50 focus:outline-none" />
                  <button type="button" onClick={() => manual.length >= 6 && resolve(manual)} disabled={manual.length < 6 || looking}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 text-sm font-medium text-white disabled:opacity-40">
                    {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find'}
                  </button>
                </div>

                <label className="mt-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-foreground/15 py-2.5 text-[11px] font-medium text-foreground/60 transition-colors hover:border-violet-400/50 hover:text-violet-600 dark:hover:text-violet-300">
                  <Upload className="h-3.5 w-3.5" /> Upload a barcode photo (best on desktop)
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={looking}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanFromFile(f); e.currentTarget.value = ''; }}
                  />
                </label>
              </div>
            </div>
          )}

          {mode === 'add' && (
            <div className="p-5">
              <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                This product isn’t in any database yet. Add its values from the pack label — it’ll be saved so everyone resolves it instantly next time.
              </div>
              <div className="mt-3 text-[11px] text-foreground/45">Barcode <span className="font-mono text-foreground/70">{pendingBarcode}</span></div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="col-span-2 text-xs text-foreground/60">Product name
                  <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Aashirvaad Atta"
                    className="mt-1 h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:outline-none" />
                </label>
                <label className="col-span-2 text-xs text-foreground/60">Brand (optional)
                  <input value={form.brand} onChange={(e) => setForm((s) => ({ ...s, brand: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:outline-none" />
                </label>
              </div>

              <div className="mt-3 text-[11px] uppercase tracking-[0.14em] text-foreground/45">Per 100 g (from the label)</div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {([['kcal', 'Energy'], ['protein', 'Protein'], ['carb', 'Carbs'], ['fat', 'Fat']] as const).map(([k, label]) => (
                  <label key={k} className="text-[11px] text-foreground/60">{label}{k === 'kcal' ? '*' : ''}
                    <input value={form[k]} inputMode="decimal"
                      onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value.replace(/[^\d.]/g, '') }))}
                      placeholder={k === 'kcal' ? 'kcal' : 'g'}
                      className="mt-1 h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-2 text-sm focus:outline-none" />
                  </label>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button type="button" onClick={() => { setMode('scan'); setManual(''); }} className="text-xs text-foreground/55 hover:text-foreground">Cancel</button>
                <button type="button" onClick={saveManual} disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save product
                </button>
              </div>
            </div>
          )}

          {mode === 'product' && product && (
            <div className="p-5">
              <div className="flex items-start gap-3">
                {product.image_url
                  ? <img src={product.image_url} alt="" className="h-16 w-16 flex-shrink-0 rounded-xl object-cover" />
                  : <div className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-xl bg-foreground/[0.05] text-2xl">🍫</div>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{product.name ?? 'Packaged food'}</div>
                  {product.brand && <div className="text-xs text-foreground/55">{product.brand}</div>}
                  <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-foreground/45">
                    {product.verified && <ShieldCheck className="h-3 w-3 text-emerald-500" />}
                    {product.kcal_100g != null ? `${product.kcal_100g} kcal / 100g · ` : ''}via {product.source === 'openfoodfacts' ? 'Open Food Facts' : product.source}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs text-foreground/60">Serving (g)
                  <input type="number" min={1} max={2000} value={grams} onChange={(e) => setGrams(Math.max(1, Number(e.target.value)))}
                    className="mt-1 h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:outline-none" />
                </label>
                <label className="text-xs text-foreground/60">Meal
                  <select value={mealType} onChange={(e) => setMealType(e.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-2 text-sm focus:outline-none">
                    {MEAL_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
              </div>

              {kcal != null && (
                <div className="mt-3 rounded-xl bg-foreground/[0.03] p-3 text-center text-sm">
                  <span className="font-semibold">{kcal} kcal</span>
                  <span className="text-foreground/55"> for {grams}g</span>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <button type="button" onClick={() => { setProduct(null); setMode('scan'); }} className="text-xs text-foreground/55 hover:text-foreground">Scan another</button>
                <button type="button" onClick={log} disabled={logging}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-400 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {logging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Log meal
                </button>
              </div>
            </div>
          )}
        </Glass>
      </motion.div>
    </div>
  );
}
