import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FolderOpen, FileText, Download, Loader2, FileImage, FileSpreadsheet, File as FileIcon, HardDrive, Files as FilesIcon, ShieldCheck, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type FileItem } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Files vault — read-only list of files the nutritionist has shared.
 * Downloads go through a backend-issued signed URL so we can enforce
 * ownership (a client can't request a sibling's file by id).
 *
 * Files live in the Supabase `client-files` storage bucket. We don't
 * try to preview content inline — every entry opens its signed URL in
 * a new tab where the browser handles PDF/image/CSV rendering natively.
 */
export default function ClientFiles() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const filesQ = useQuery({
    queryKey: ['me', 'files'],
    queryFn: () => clientsApi.myFiles(),
    retry: 1,
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast.error('File too large - keep it under 25 MB.'); return; }
    setUploading(true);
    try {
      const ticket = await clientsApi.fileUploadTicket(f.name);
      const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await clientsApi.addMyFile({ storage_key: ticket.storageKey, file_name: f.name, file_type: f.type || undefined, file_size: f.size });
      toast.success('File uploaded - your nutritionist can see it.');
      qc.invalidateQueries({ queryKey: ['me', 'files'] });
    } catch (err) {
      toast.error((err as Error).message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const files = filesQ.data ?? [];
  const totalBytes = files.reduce((sum, f) => sum + (f.file_size ?? 0), 0);
  const totalSizeLabel = formatSize(totalBytes) ?? '0 B';
  const latest = files.reduce<FileItem | null>((acc, f) => {
    if (!acc) return f;
    return new Date(f.created_at) > new Date(acc.created_at) ? f : acc;
  }, null);
  const latestLabel = latest
    ? new Date(latest.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '-';

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">

          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-300">
                <FolderOpen className="h-4 w-4" />
                <span className="text-xs uppercase tracking-[0.18em]">Your file vault</span>
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Files.</h1>
              <p className="mt-1.5 max-w-2xl text-sm text-foreground/60">
                Upload your lab reports and documents for your nutritionist to see - and find anything they've shared with you here too.
              </p>
            </div>
            <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.55)] disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload a file
            </button>
          </motion.div>

          {/* Stat strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={FilesIcon} label="Files" value={String(files.length)} tint="text-cyan-600 dark:text-cyan-300" />
            <StatTile icon={HardDrive} label="Total size" value={totalSizeLabel} tint="text-blue-600 dark:text-blue-300" />
            <StatTile icon={ShieldCheck} label="Latest" value={latestLabel} tint="text-emerald-600 dark:text-emerald-300" />
          </motion.div>

          {/* Body */}
          {filesQ.isLoading ? (
            <motion.div variants={fadeUp}>
              <Glass className="flex items-center justify-center p-16 text-sm text-foreground/55">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </Glass>
            </motion.div>
          ) : files.length === 0 ? (
            <motion.div variants={fadeUp}>
              <Glass className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-cyan-600 dark:text-cyan-300">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <div className="mt-1 text-sm font-medium text-foreground/80">Nothing here yet</div>
                <div className="max-w-sm text-xs text-foreground/50">
                  Upload a lab report or document for your nutritionist, or wait for files they share - everything shows up here.
                </div>
              </Glass>
            </motion.div>
          ) : (
            <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((f) => (
                <FileCard key={f.id} file={f} />
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>
    </ClientLayout>
  );
}

function StatTile({ icon: Icon, label, value, tint }: { icon: typeof FileText; label: string; value: string; tint: string }) {
  return (
    <Glass className="p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-3.5 w-3.5', tint)} strokeWidth={1.8} />
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
      </div>
      <div className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    </Glass>
  );
}

function FileCard({ file }: { file: FileItem }) {
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const mine = file.uploaded_by === 'client';

  const signMut = useMutation({
    mutationFn: () => clientsApi.signFile(file.id),
    onSuccess: (res) => {
      window.open(res.url, '_blank', 'noopener,noreferrer');
      setDownloading(false);
    },
    onError: (err: Error) => {
      setDownloading(false);
      toast.error(err.message ?? 'Could not generate download link.');
    },
  });

  const delMut = useMutation({
    mutationFn: () => clientsApi.deleteMyFile(file.id),
    onSuccess: () => {
      toast.success('File deleted');
      qc.invalidateQueries({ queryKey: ['me', 'files'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not delete file.'),
  });

  function openFile() {
    setDownloading(true);
    signMut.mutate();
  }

  const meta = metaFor(file.file_name, file.file_type);
  const Icon = meta.icon;
  const sizeLabel = formatSize(file.file_size);

  return (
    <Glass className="group flex h-full flex-col p-5 transition-all hover:-translate-y-px hover:bg-foreground/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className={cn('grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl', meta.tint)}>
          <Icon className="h-5 w-5" />
        </div>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em]',
          mine ? 'bg-blue-500/15 text-blue-700 dark:text-blue-200' : 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-200',
        )}>
          {mine ? 'You uploaded' : 'From nutritionist'}
        </span>
      </div>

      <div className="mt-4 min-w-0 flex-1">
        <div className="line-clamp-2 break-words text-sm font-medium leading-snug">{file.file_name}</div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-foreground/55">
          <span>{new Date(file.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {sizeLabel && <><span className="text-foreground/30">•</span><span>{sizeLabel}</span></>}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={openFile}
          disabled={downloading}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-foreground/15 px-3 py-2 text-xs font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.05] disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download
        </button>
        {mine && (
          <button
            type="button"
            onClick={() => delMut.mutate()}
            disabled={delMut.isPending}
            title="Delete"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border border-foreground/15 text-foreground/60 transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
          >
            {delMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </Glass>
  );
}

function metaFor(name: string, mime: string | null): { icon: typeof FileText; tint: string } {
  const lower = name.toLowerCase();
  if (mime?.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(lower))
    return { icon: FileImage, tint: 'bg-teal-400/15 text-teal-600 dark:text-teal-300' };
  if (mime?.includes('pdf') || lower.endsWith('.pdf'))
    return { icon: FileText, tint: 'bg-cyan-400/15 text-cyan-600 dark:text-cyan-300' };
  if (mime?.includes('spreadsheet') || mime?.includes('csv') || /\.(xlsx?|csv|tsv)$/i.test(lower))
    return { icon: FileSpreadsheet, tint: 'bg-emerald-400/15 text-emerald-600 dark:text-emerald-300' };
  return { icon: FileIcon, tint: 'bg-blue-400/15 text-blue-600 dark:text-blue-300' };
}

function formatSize(bytes: number | null): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
