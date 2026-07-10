import { useRef, useState, type ChangeEvent } from 'react';
import { Image, Hash, Pin, Sparkles, Send, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';

interface PostComposerProps {
  onPost: (payload: { body: string; pin: boolean; cohort: string; imageUrl?: string | null }) => void;
  /** Real cohorts (community groups) for this workspace. */
  cohorts?: Array<{ id: string; label: string }>;
}

const ALL_COHORTS = 'All cohorts';

export function PostComposer({ onPost, cohorts = [] }: PostComposerProps) {
  const [body, setBody] = useState('');
  const [pin, setPin] = useState(false);
  const [cohort, setCohort] = useState(ALL_COHORTS);
  const [expanded, setExpanded] = useState(false);
  const [cohortOpen, setCohortOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgFit, setImgFit] = useState<'contain' | 'cover'>('contain');
  const [imgSize, setImgSize] = useState<'sm' | 'md' | 'lg'>('md');
  const fileRef = useRef<HTMLInputElement>(null);

  const cohortOptions = [ALL_COHORTS, ...cohorts.map((c) => c.label)];

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error('Image is too large — keep it under 8 MB.');
      return;
    }
    setImgLoading(true);
    try {
      setImageUrl(await downscaleToDataUrl(f, 1280, 0.82));
    } catch {
      toast.error('Could not process that image.');
    } finally {
      setImgLoading(false);
    }
  }

  function reset() {
    setBody('');
    setPin(false);
    setExpanded(false);
    setImageUrl(null);
    setImgFit('contain');
    setImgSize('md');
  }

  function handlePost() {
    if (!body.trim() && !imageUrl) return;
    onPost({ body: body.trim(), pin, cohort, imageUrl });
    reset();
  }

  return (
    <Glass variant="heavy">
      <div className="flex items-start gap-3 px-5 pt-5">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.35)] to-[hsl(var(--brand-magenta)_/_0.25)] text-xs font-medium">
          YO
        </div>
        <div className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder="Share an announcement, a win, a question…"
            rows={expanded ? 4 : 1}
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-foreground/35 focus:outline-none"
          />
        </div>
      </div>

      {/* Expanded controls */}
      {(expanded || body) && (
        <div className="space-y-3 px-5 py-3">
          {/* Cohort picker + pin toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setCohortOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[11px] text-foreground/85 hover:bg-foreground/[0.06]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {cohort}
              </button>
              {cohortOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCohortOpen(false)} />
                  <div className="absolute left-0 top-9 z-20 max-h-64 w-48 overflow-y-auto rounded-xl border border-foreground/10 bg-surface-2 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]">
                    {cohortOptions.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setCohort(c);
                          setCohortOpen(false);
                        }}
                        className={cn(
                          'block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-foreground/[0.05]',
                          cohort === c ? 'text-foreground' : 'text-foreground/80 dark:text-foreground/65',
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setPin((p) => !p)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition-colors',
                pin
                  ? 'border-teal-400/50 bg-teal-400/[0.08] text-teal-700 dark:text-teal-200'
                  : 'border-foreground/10 bg-foreground/[0.03] text-foreground/80 dark:text-foreground/65 hover:bg-foreground/[0.06]',
              )}
            >
              <Pin className={cn('h-3 w-3', pin && 'fill-current')} />
              {pin ? 'Pinned to top' : 'Pin to top'}
            </button>
          </div>

          {/* Image preview */}
          {imageUrl && (
            <div className="space-y-2">
              <div className="relative w-full overflow-hidden rounded-xl border border-foreground/10 bg-foreground/[0.04]">
                <img
                  src={imageUrl}
                  alt="Attachment preview"
                  className={cn(
                    'mx-auto w-full transition-[max-height] duration-200',
                    imgFit === 'cover' ? 'object-cover' : 'object-contain',
                    imgSize === 'sm' && 'max-h-48',
                    imgSize === 'md' && 'max-h-72',
                    imgSize === 'lg' && 'max-h-[32rem]',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  aria-label="Remove image"
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white hover:bg-black/70"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Size + fit controls */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-foreground/50">Size</span>
                <div className="inline-flex overflow-hidden rounded-lg border border-foreground/10">
                  {(['sm', 'md', 'lg'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setImgSize(s)}
                      className={cn(
                        'px-2.5 py-1 text-[11px] capitalize transition-colors',
                        imgSize === s
                          ? 'bg-foreground/10 text-foreground'
                          : 'text-foreground/60 hover:bg-foreground/[0.05]',
                      )}
                    >
                      {s === 'sm' ? 'Small' : s === 'md' ? 'Medium' : 'Large'}
                    </button>
                  ))}
                </div>
                <span className="ml-1 text-[11px] text-foreground/50">Fit</span>
                <div className="inline-flex overflow-hidden rounded-lg border border-foreground/10">
                  {(['contain', 'cover'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setImgFit(f)}
                      className={cn(
                        'px-2.5 py-1 text-[11px] capitalize transition-colors',
                        imgFit === f
                          ? 'bg-foreground/10 text-foreground'
                          : 'text-foreground/60 hover:bg-foreground/[0.05]',
                      )}
                    >
                      {f === 'contain' ? 'Fit whole' : 'Fill'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={imgLoading}
                className="grid h-8 w-8 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-50"
                aria-label="Add photo"
              >
                {imgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setBody((b) => `${b} #`)}
                className="grid h-8 w-8 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                aria-label="Add hashtag"
              >
                <Hash className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => toast('SIRAH-drafted posts ship with the AI module.')}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] text-teal-700 dark:text-teal-300 transition-colors hover:bg-teal-400/[0.08]"
              >
                <Sparkles className="h-3 w-3" />
                Ask SIRAH to draft
              </button>
            </div>
            <div className="flex items-center gap-2">
              {expanded && (
                <button
                  type="button"
                  onClick={reset}
                  className="grid h-8 w-8 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 hover:text-foreground"
                  aria-label="Discard"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePost}
                disabled={!body.trim() && !imageUrl}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-xs font-medium text-foreground transition-transform duration-200 hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Post
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </Glass>
  );
}

/**
 * Read an image File and return a JPEG data URL, downscaled so its longest edge
 * is `max` px. Keeps community-post images small enough to store inline (the
 * proper object-storage upload lands with the Storage module).
 */
async function downscaleToDataUrl(file: File, max = 1280, quality = 0.82): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not decode the image.'));
    i.src = raw;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
