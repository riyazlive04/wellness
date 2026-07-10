import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Camera, Loader2, Trash2, Upload, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type ProgressPhoto } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Progress photo journal — upload a photo (front/side/back angle), see
 * timeline of past photos as signed URLs, swipe through history.
 *
 * Two-step upload: client first asks backend for a signed PUT URL +
 * storage key, then PUTs the file directly to Supabase storage, then
 * POSTs to the API to create the DB row referencing the storage_key.
 * This keeps large bytes off our backend.
 */
export default function ClientPhotos() {
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const photosQ = useQuery({
    queryKey: ['me', 'photos'],
    queryFn: () => clientsApi.progressPhotos(),
    retry: 1,
  });

  const photos = photosQ.data ?? [];
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">

        <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Visible · Progress photos</span>
            <h1 className="mt-1 text-3xl font-semibold md:text-4xl">See what the scale can't.</h1>
            <p className="mt-2 max-w-2xl text-sm text-foreground/65">
              Weekly photos make change visible. Same angle, same time of day, same lighting if you can.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.55)]"
          >
            <Upload className="h-4 w-4" /> Upload photo
          </button>
        </motion.div>

        {photosQ.isLoading ? (
          <motion.div variants={fadeUp}>
            <Glass className="mt-6 flex items-center justify-center p-10 text-sm text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </Glass>
          </motion.div>
        ) : photos.length === 0 ? (
          <motion.div variants={fadeUp}>
            <Glass className="mt-6 flex flex-col items-center gap-3 p-10 text-center">
              <Camera className="h-7 w-7 text-foreground/35" />
              <div className="text-sm text-foreground/65">No photos yet. Take your first front-angle photo to start the timeline.</div>
            </Glass>
          </motion.div>
        ) : (
          <motion.div variants={fadeUp} className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <PhotoTile key={p.id} photo={p} onClick={() => setViewing(p)} />
            ))}
          </motion.div>
        )}
      </motion.div>

      {open && <UploadDialog onClose={() => setOpen(false)} />}
      {viewing && <ViewerDialog photo={viewing} onClose={() => setViewing(null)} onDeleted={() => {
        setViewing(null);
        queryClient.invalidateQueries({ queryKey: ['me', 'photos'] });
      }} />}
    </ClientLayout>
  );
}

function PhotoTile({ photo, onClick }: { photo: ProgressPhoto; onClick: () => void }) {
  const signed = useQuery({
    queryKey: ['me', 'photo-url', photo.id],
    queryFn: () => clientsApi.signPhoto(photo.id),
    retry: 1,
    staleTime: 30 * 60 * 1000,
  });
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-foreground/[0.06] bg-foreground/[0.04]"
    >
      {signed.isLoading ? (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/45" />
        </div>
      ) : signed.data ? (
        <img src={signed.data.url} alt={photo.angle ?? 'progress'} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-foreground/35">
          <ImageIcon className="h-6 w-6" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/75 via-black/45 to-transparent p-2 pt-6 text-left text-white">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em]">
            {new Date(photo.taken_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
          </span>
          {photo.angle && (
            <span className="flex-shrink-0 rounded-full bg-white/20 px-1.5 py-0 text-[9px] uppercase tracking-[0.16em] backdrop-blur-sm">
              {photo.angle}
            </span>
          )}
        </div>
        {(photo.weight_kg != null || photo.notes) && (
          <div className="flex items-center gap-1.5 text-[10px] text-white/85">
            {photo.weight_kg != null && <span className="flex-shrink-0 font-semibold">{photo.weight_kg} kg</span>}
            {photo.notes && <span className="truncate">{photo.weight_kg != null ? '· ' : ''}{photo.notes}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

function ViewerDialog({ photo, onClose, onDeleted }: {
  photo: ProgressPhoto; onClose: () => void; onDeleted: () => void;
}) {
  const signed = useQuery({
    queryKey: ['me', 'photo-url', photo.id],
    queryFn: () => clientsApi.signPhoto(photo.id),
    retry: 1,
    staleTime: 30 * 60 * 1000,
  });
  const del = useMutation({
    mutationFn: () => clientsApi.deletePhoto(photo.id),
    onSuccess: () => { toast.success('Deleted.'); onDeleted(); },
    onError: (err: Error) => toast.error(err.message ?? 'Could not delete.'),
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 " onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <button type="button" onClick={onClose}
          className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
          aria-label="Close"><X className="h-4 w-4" /></button>
        <div className="aspect-[3/4] w-full bg-foreground/[0.04]">
          {signed.data ? (
            <img src={signed.data.url} alt={photo.angle ?? 'progress'} className="h-full w-full object-contain" />
          ) : (
            <div className="grid h-full place-items-center"><Loader2 className="h-6 w-6 animate-spin text-foreground/45" /></div>
          )}
        </div>
        <footer className="flex items-start justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {new Date(photo.taken_at).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
            </div>
            <div className="text-[11px] text-foreground/55">
              {photo.angle ? `${photo.angle} view` : 'unspecified angle'}
              {photo.weight_kg != null && <> · {photo.weight_kg} kg</>}
            </div>
            {photo.notes && (
              <div className="mt-1.5 text-xs italic text-foreground/75">“{photo.notes}”</div>
            )}
          </div>
          <button type="button" onClick={() => { if (confirm('Delete this photo?')) del.mutate(); }}
            disabled={del.isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/40 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-500/10 disabled:opacity-50">
            {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </button>
        </footer>
      </motion.div>
    </div>
  );
}

function UploadDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [angle, setAngle] = useState<'front' | 'side' | 'back'>('front');
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      // 1. Ask backend for signed upload URL + storage key.
      const ticket = await clientsApi.photoUploadTicket(file.name);
      // 2. PUT bytes directly to Supabase storage via the signed URL.
      const putResp = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putResp.ok) {
        throw new Error(`Upload failed (${putResp.status})`);
      }
      // 3. Create the DB row pointing at the storage key.
      const w = weight.trim() === '' ? undefined : Number(weight);
      await clientsApi.addPhoto({
        storage_key: ticket.storageKey,
        angle,
        weight_kg: w != null && Number.isFinite(w) ? w : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success('Uploaded.');
      queryClient.invalidateQueries({ queryKey: ['me', 'photos'] });
      onClose();
    } catch (err) {
      toast.error((err as Error).message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 " onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-foreground/[0.06] px-5 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Photo journal</div>
            <div className="text-base font-semibold">Upload progress photo</div>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]"
            aria-label="Close"><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 p-5">
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Photo</div>
            <input
              type="file"
              accept="image/*"
              capture="user"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-foreground/[0.05] file:px-3 file:py-1 file:text-xs"
            />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Angle</div>
            <div className="grid grid-cols-3 gap-2">
              {(['front', 'side', 'back'] as const).map((a) => (
                <button key={a} type="button" onClick={() => setAngle(a)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-xs capitalize transition-colors',
                    angle === a
                      ? 'border-teal-400/60 bg-teal-400/10'
                      : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
                  )}>{a}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Weight (kg) — optional</div>
            <input type="number" step={0.1} inputMode="decimal" value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
              placeholder="e.g. 78.4" />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Notes (optional)</div>
            <input type="text" maxLength={500} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
              placeholder="Morning, after gym, etc." />
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-full px-4 py-1.5 text-sm text-foreground/75 hover:bg-foreground/[0.05]">Cancel</button>
          <button type="button" onClick={handleUpload} disabled={uploading || !file}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Upload
          </button>
        </footer>
      </motion.div>
    </div>
  );
}