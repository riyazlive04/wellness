import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Upload, ArrowRight } from 'lucide-react';

import { AIGlow, Glass } from '@/design-system';
import { SAMPLE_PLATES } from '../data/samplePlates';
import type { SamplePlate } from '../types';
import { cn } from '@/lib/utils';

interface UploadZoneProps {
  onPickSample: (plate: SamplePlate) => void;
  /** Called with both the preview URL (for immediate display) and the File (for upload). */
  onUpload: (imageUrl: string, file: File) => void;
}

export function UploadZone({ onPickSample, onUpload }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => onUpload(String(reader.result), file);
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <AIGlow intensity="soft" animated>
        <Glass variant="heavy" className="rounded-2xl">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 transition-colors',
              dragging
                ? 'border-emerald-400/60 bg-emerald-400/[0.04]'
                : 'border-foreground/15 hover:border-foreground/25',
            )}
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.25)] to-[hsl(var(--brand-magenta)_/_0.20)] text-violet-700 dark:text-violet-200">
              <Camera className="h-6 w-6" />
            </div>
            <div className="text-center">
              <div className="text-base font-medium tracking-tight">Snap a plate or drop a photo</div>
              <p className="mt-1 max-w-md text-xs text-foreground/75 dark:text-foreground/55">
                SIRAH Vision detects foods, estimates portions, and matches them against the IFCT
                and USDA nutrition databases.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-foreground transition-transform duration-200 hover:scale-[1.02]"
              >
                <Upload className="h-4 w-4" />
                Choose a photo
              </button>
              <span className="text-xs text-foreground/75 dark:text-foreground/55">or drag-and-drop</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        </Glass>
      </AIGlow>

      {/* Sample plates */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Or try a sample</div>
            <div className="text-sm text-foreground/75 dark:text-foreground/55">No camera, no problem. Tap any plate to demo the flow.</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {SAMPLE_PLATES.map((plate) => (
            <SamplePlateButton key={plate.id} plate={plate} onClick={() => onPickSample(plate)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SamplePlateButton({ plate, onClick }: { plate: SamplePlate; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="group relative aspect-square overflow-hidden rounded-2xl border border-foreground/[0.06] bg-surface-2 text-left transition-colors hover:border-foreground/15"
    >
      {!failed ? (
        <img
          src={plate.imageUrl}
          alt={plate.label}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 50% 35%, ${plate.fallbackColor}, hsl(var(--surface-2)))`,
          }}
        />
      )}

      {/* Gradient bottom */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-3 text-left">
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{plate.cuisine}</div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{plate.label}</span>
          <ArrowRight className="h-3.5 w-3.5 text-foreground/75 dark:text-foreground/60 transition-transform group-hover:translate-x-0.5" />
        </div>
        <div className="mt-0.5 text-[10px] text-foreground/75 dark:text-foreground/60">{plate.hint}</div>
      </div>
    </motion.button>
  );
}
