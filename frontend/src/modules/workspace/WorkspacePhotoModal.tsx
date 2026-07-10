import { useRef, type ChangeEvent } from 'react';
import { Camera, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { fileToLogoDataUrl, setWorkspaceLogo, useWorkspaceBrand } from '@/lib/workspaceBrand';

/**
 * Shared workspace-photo dialog: zooms the practice logo and offers
 * Change / Remove. Used by both the sidebar profile avatar and the
 * Settings → General logo box so they behave identically.
 */
export function WorkspacePhotoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logoUrl, practiceName } = useWorkspaceBrand();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPG, or SVG).');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Image is too large — keep it under 5 MB.');
      return;
    }
    try {
      const url = await fileToLogoDataUrl(f, 256);
      setWorkspaceLogo(url);
      toast.success('Profile photo updated.');
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not process that image.');
    }
  }

  function remove() {
    setWorkspaceLogo(null);
    toast('Profile photo removed.');
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4 "
      onClick={onClose}
    >
      <Glass variant="heavy" className="w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">{practiceName}</h3>
            <p className="text-xs text-foreground/60">Workspace profile photo</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-lg text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Zoomed photo */}
        <div className="mt-4 grid place-items-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={practiceName}
              className="h-56 w-56 rounded-2xl object-contain ring-1 ring-foreground/10"
            />
          ) : (
            <div className="grid h-56 w-56 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)] text-foreground/50 ring-1 ring-foreground/10">
              <div className="flex flex-col items-center gap-2">
                <Camera className="h-8 w-8" />
                <span className="text-[11px] uppercase tracking-[0.18em]">No photo</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
          >
            <Camera className="h-3.5 w-3.5" />
            {logoUrl ? 'Change photo' : 'Upload photo'}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={remove}
              className="inline-flex items-center gap-2 rounded-full border border-rose-400/30 px-4 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-400/10 dark:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </Glass>
    </div>
  );
}
