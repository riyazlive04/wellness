import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Folder, FileText, Download, Loader2, FileImage, FileSpreadsheet, File as FileIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type FileItem } from '@/modules/workspace/api/clients';

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

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">

        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Vault · From your nutritionist</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Files shared with you.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            Lab reports, meal plans, prescriptions — anything your nutritionist sends shows up here. Download links expire after 10 minutes for safety.
          </p>
        </motion.div>

        {filesQ.isLoading ? (
          <motion.div variants={fadeUp}>
            <Glass className="mt-6 flex items-center justify-center p-10 text-sm text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </Glass>
          </motion.div>
        ) : files.length === 0 ? (
          <motion.div variants={fadeUp}>
            <Glass className="mt-6 flex flex-col items-center gap-3 p-10 text-center">
              <Folder className="h-7 w-7 text-foreground/35" />
              <div className="text-sm text-foreground/65">Nothing here yet. Your nutritionist hasn't shared any files.</div>
            </Glass>
          </motion.div>
        ) : (
          <motion.div variants={fadeUp} className="mt-6 space-y-2">
            {files.map((f) => (
              <FileRow key={f.id} file={f} />
            ))}
          </motion.div>
        )}
      </motion.div>
    </ClientLayout>
  );
}

function FileRow({ file }: { file: FileItem }) {
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

  const Icon = iconFor(file.file_name, file.file_type);
  const sizeLabel = formatSize(file.file_size);

  return (
    <Glass className="flex items-center gap-3 p-3">
      <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-foreground/[0.04] text-foreground/65">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{file.file_name}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-foreground/55">
          <span>{new Date(file.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {sizeLabel && <><span className="text-foreground/30">•</span><span>{sizeLabel}</span></>}
          {file.file_type && <><span className="text-foreground/30">•</span><span className="uppercase">{file.file_type.split('/').pop()}</span></>}
        </div>
      </div>
      <button
        type="button"
        onClick={openFile}
        disabled={downloading}
        className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/85 hover:bg-foreground/[0.05] disabled:opacity-50"
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Download
      </button>
    </Glass>
  );
}

function iconFor(name: string, mime: string | null): typeof FileText {
  const lower = name.toLowerCase();
  if (mime?.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(lower)) return FileImage;
  if (mime?.includes('pdf') || lower.endsWith('.pdf')) return FileText;
  if (mime?.includes('spreadsheet') || mime?.includes('csv') || /\.(xlsx?|csv|tsv)$/i.test(lower)) return FileSpreadsheet;
  return FileIcon;
}

function formatSize(bytes: number | null): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}