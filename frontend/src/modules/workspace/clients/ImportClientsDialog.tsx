import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Upload, X, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { clientsApi } from '@/modules/workspace/api/clients';

interface ParsedRow { email: string; name?: string; phone?: string }
type ImportResult = { total: number; created: number; skipped: Array<{ email: string; reason: string }> };

/**
 * CSV client importer. Parses a name,email,phone CSV in the browser, previews
 * the valid rows, then POSTs them to the idempotent bulk-import endpoint.
 *
 * Importing does NOT create clients — it pre-approves emails. Nobody is on the
 * roster until they sign up through the join link themselves; an imported
 * email just skips the approval queue when they do.
 */
export function ImportClientsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const importMut = useMutation({
    mutationFn: () => clientsApi.importClients(rows),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ['workspace', 'clients'] });
      qc.invalidateQueries({ queryKey: ['workspace', 'clients', 'preapprovals'] });
      toast.success(`Pre-approved ${res.created} of ${res.total}.`);
    },
    onError: (e: Error) => toast.error(e.message ?? 'Import failed.'),
  });

  async function onFile(file: File) {
    setParseError(null);
    setResult(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setParseError('No rows with an email were found. Expected columns: name, email, phone.');
        setRows([]);
      } else {
        setRows(parsed);
        setFileName(file.name);
      }
    } catch {
      setParseError('Could not read that file. Please upload a .csv.');
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-teal-600 dark:text-teal-300" />
            <span className="text-sm font-semibold">Import clients from CSV</span>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-foreground/60 hover:bg-foreground/[0.06]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5">
          {result ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <p className="mt-3 text-sm font-medium">Imported {result.created} of {result.total}.</p>
              {result.skipped.length > 0 && (
                <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3 text-left">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" /> {result.skipped.length} skipped
                  </div>
                  <ul className="space-y-1 text-xs text-foreground/70">
                    {result.skipped.map((s, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="truncate">{s.email}</span>
                        <span className="flex-shrink-0 text-foreground/50">{s.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button type="button" onClick={onClose} className="mt-5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white">
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground/70">
                Upload a <strong>.csv</strong> with columns <code className="rounded bg-foreground/[0.06] px-1">name</code>,
                {' '}<code className="rounded bg-foreground/[0.06] px-1">email</code>,
                {' '}<code className="rounded bg-foreground/[0.06] px-1">phone</code>. Imported people are
                pre-approved: when they open your join link and sign up, they skip the approval queue
                and land straight on your roster. Anyone already active is skipped.
              </p>

              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-4 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-foreground/15 bg-foreground/[0.02] py-8 text-sm text-foreground/65 transition-colors hover:bg-foreground/[0.04]"
              >
                <Upload className="h-5 w-5" />
                {fileName ? <span className="font-medium text-foreground">{fileName}</span> : 'Choose CSV file'}
              </button>

              {parseError && <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{parseError}</p>}

              {rows.length > 0 && (
                <Glass className="mt-4 overflow-hidden p-0">
                  <div className="border-b border-foreground/[0.06] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-foreground/55">
                    {rows.length} valid {rows.length === 1 ? 'row' : 'rows'} · preview
                  </div>
                  <ul className="max-h-40 divide-y divide-foreground/[0.05] overflow-y-auto">
                    {rows.slice(0, 50).map((r, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                        <span className="truncate font-medium">{r.name || r.email}</span>
                        <span className="flex-shrink-0 text-foreground/55">{r.email}</span>
                      </li>
                    ))}
                  </ul>
                </Glass>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04]">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rows.length === 0 || importMut.isPending}
                  onClick={() => importMut.mutate()}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {importMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Import {rows.length || ''}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Minimal RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes, and
 * CRLF. Maps name/email/phone columns by header; keeps only rows with an email.
 */
function parseCsv(text: string): ParsedRow[] {
  const records = splitRecords(text);
  if (records.length === 0) return [];
  const header = records[0].map((h) => h.trim().toLowerCase());
  const emailIdx = header.findIndex((h) => h === 'email' || h === 'e-mail');
  const nameIdx = header.findIndex((h) => h === 'name' || h === 'full name' || h === 'client');
  const phoneIdx = header.findIndex((h) => h === 'phone' || h === 'mobile' || h === 'contact');
  // No header row → assume the first column is email.
  const hasHeader = emailIdx !== -1;
  const dataRows = hasHeader ? records.slice(1) : records;
  const eIdx = hasHeader ? emailIdx : 0;

  const out: ParsedRow[] = [];
  for (const cells of dataRows) {
    const email = (cells[eIdx] ?? '').trim();
    if (!email || !email.includes('@')) continue;
    out.push({
      email,
      name: nameIdx !== -1 ? (cells[nameIdx] ?? '').trim() || undefined : undefined,
      phone: phoneIdx !== -1 ? (cells[phoneIdx] ?? '').trim() || undefined : undefined,
    });
  }
  return out;
}

function splitRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((c) => c.trim() !== '')) rows.push(row); }
  return rows;
}
