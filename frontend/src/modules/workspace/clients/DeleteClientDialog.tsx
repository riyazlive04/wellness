import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { clientsApi } from '../api/clients';

interface DeleteClientDialogProps {
  client: { id: string; name: string } | null;
  onClose: () => void;
  onDeleted?: () => void;
}

/**
 * Permanent-delete confirmation. The owner has to type the client's name —
 * this destroys meal logs, messages, assessments, photos and program history
 * across 40+ tables with no undo, so a one-click "Are you sure?" is not enough
 * friction for the cost of getting it wrong.
 */
export function DeleteClientDialog({ client, onClose, onDeleted }: DeleteClientDialogProps) {
  const qc = useQueryClient();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  if (!client) return null;

  const confirmed = typed.trim().toLowerCase() === client.name.trim().toLowerCase();

  function close() {
    if (busy) return;
    setTyped('');
    onClose();
  }

  async function remove() {
    if (!confirmed || busy || !client) return;
    setBusy(true);
    try {
      await clientsApi.purgeClient(client.id);
      toast.success(`${client.name} was permanently deleted`);
      void qc.invalidateQueries({ queryKey: ['workspace', 'clients'] });
      onDeleted?.();
      setTyped('');
      onClose();
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not delete this client');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" onClick={close}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md p-4 md:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Glass variant="heavy" className="overflow-hidden rounded-2xl border-rose-400/40">
          <header className="flex items-start justify-between px-6 pt-6">
            <div className="flex gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-500/15">
                <AlertTriangle className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Delete {client.name}?</h2>
                <p className="mt-1 text-xs text-foreground/75 dark:text-foreground/55">
                  This cannot be undone.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              className="grid h-8 w-8 place-items-center rounded-lg text-foreground/75 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="space-y-4 px-6 pb-6 pt-5">
            <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-4 text-xs leading-relaxed text-foreground/80">
              Permanently erases their meal logs, messages, assessments, progress photos,
              measurements, journal entries, appointments and program history. Their login
              stays, but everything they did in your workspace is gone for good.
            </div>

            <label className="block">
              <div className="mb-1.5 text-xs font-medium text-foreground/75">
                Type <span className="font-semibold text-foreground">{client.name}</span> to confirm
              </div>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                autoComplete="off"
                className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/45 focus:border-rose-400/60 focus:outline-none"
                placeholder={client.name}
              />
            </label>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={!confirmed || busy}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete permanently'}
              </button>
            </div>
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}
