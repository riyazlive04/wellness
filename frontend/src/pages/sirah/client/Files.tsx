import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FolderOpen, FileText, Download, Loader2, FileImage, FileSpreadsheet, File as FileIcon, HardDrive, Files as FilesIcon, ShieldCheck } from 'lucide-react';
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
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const filesQ = useQuery({
    queryKey: ['me', 'files'],
    queryFn: () => clientsApi.myFiles(),
    retry: 1,
  });

  const files = filesQ.data ?? [];
  const totalBytes = files.reduce((sum, f) => sum + (f.file_size ?? 0), 0);
  const totalSizeLabel = formatSize(totalBytes) ?? '0 B';
  const latest = files.reduce<FileItem | null>((acc, f) => {
    if (!acc) return f;
    return new Date(f.created_at) > new Date(acc.created_at) ? f : acc;
  }, null);
  const latestLabel = latest
    ? new Date(latest.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '—';

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">

          {/* Header */}
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-fuchsia-600 dark:text-fuchsia-300">
              <FolderOpen className="h-4 w-4" />
              <span className="text-xs uppercase tracking-[0.18em]">Vault · From your nutritionist</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Files shared with you.</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-foreground/60">
              Lab reports, meal plans, prescriptions — anything your nutritionist sends shows up here. Download links expire after 10 minutes for safety.
            </p>
          </motion.div>

          {/* Stat strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={FilesIcon} label="Files" value={String(files.length)} tint="text-fuchsia-600 dark:text-fuchsia-300" />
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
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/15 to-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <div className="mt-1 text-sm font-medium text-foreground/80">Nothing here yet</div>
                <div className="max-w-sm text-xs text-foreground/50">
                  Your nutritionist hasn't shared any files. Lab reports, meal plans and prescriptions will appear here when they do.
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
  const [downloading, setDownloading] = useState(false);

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

  function openFile() {
    setDownloading(true);
    signMut.mutate();
  }

  const meta = metaFor(file.file_name, file.file_type);
  const Icon = meta.icon;
  const sizeLabel = formatSize(file.file_size);
  const ext = file.file_type ? file.file_type.split('/').pop() : null;

  return (
    <Glass className="group flex h-full flex-col p-5 transition-all hover:-translate-y-px hover:bg-foreground/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className={cn('grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl', meta.tint)}>
          <Icon className="h-5 w-5" />
        </div>
        {ext && (
          <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-foreground/55">
            {ext}
          </span>
        )}
      </div>

      <div className="mt-4 min-w-0 flex-1">
        <div className="line-clamp-2 break-words text-sm font-medium leading-snug">{file.file_name}</div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-foreground/55">
          <span>{new Date(file.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {sizeLabel && <><span className="text-foreground/30">•</span><span>{sizeLabel}</span></>}
        </div>
      </div>

      <button
        type="button"
        onClick={openFile}
        disabled={downloading}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-foreground/15 px-3 py-2 text-xs font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.05] disabled:opacity-50"
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Download
      </button>
    </Glass>
  );
}

function metaFor(name: string, mime: string | null): { icon: typeof FileText; tint: string } {
  const lower = name.toLowerCase();
  if (mime?.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(lower))
    return { icon: FileImage, tint: 'bg-violet-400/15 text-violet-600 dark:text-violet-300' };
  if (mime?.includes('pdf') || lower.endsWith('.pdf'))
    return { icon: FileText, tint: 'bg-fuchsia-400/15 text-fuchsia-600 dark:text-fuchsia-300' };
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
