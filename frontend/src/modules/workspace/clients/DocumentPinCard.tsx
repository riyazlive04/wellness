import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, LockOpen } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { ApiError } from '@/lib/api';
import { clientsApi } from '@/modules/workspace/api/clients';
import { featuresOf } from '@/lib/planCapabilities';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';

/**
 * Put a 4-digit PIN on one client's documents, or take it off.
 *
 * For reports that should not be open to every member of staff. Everyone on
 * the practice side must enter it - owner, assistant, receptionist - and so
 * must a NUSI platform admin. The client is never asked: their own app shows
 * their documents as normal.
 *
 * The PIN is never readable once set, only replaceable, so a practice that
 * forgets it needs a new one rather than a reminder. That is also the way out
 * of a lockout, which is why setting one clears the lock - and why this card
 * sits outside the prompt it controls.
 */
export function DocumentPinCard({ clientId, clientName }: { clientId: string; clientName: string }) {
  const qc = useQueryClient();
  const { data: scope } = useScope();
  const [pin, setPin] = useState('');
  const [editing, setEditing] = useState(false);

  const q = useQuery({
    queryKey: ['client', clientId, 'document-pin'],
    queryFn: () => clientsApi.documentPinStatus(clientId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['client', clientId, 'document-pin'] });

  const save = useMutation({
    mutationFn: (code: string) => clientsApi.setDocumentPin(clientId, code),
    onSuccess: () => {
      setPin('');
      setEditing(false);
      invalidate();
      toast.success('PIN set. Note the 4 digits somewhere — we cannot show it again.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not set the PIN.'),
  });

  const clear = useMutation({
    mutationFn: () => clientsApi.clearDocumentPin(clientId),
    onSuccess: () => {
      invalidate();
      toast.success('PIN removed. Their documents open without one now.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove the PIN.'),
  });

  const enabled = !!q.data?.enabled;
  const lockedFor = q.data?.locked_minutes ?? 0;

  // A Growth feature. The card hides on a plan without it - unless a PIN is
  // already set, because a practice that downgraded must still be able to
  // take it off; otherwise their own documents stay locked with no control
  // anywhere to unlock them.
  const canUse = featuresOf(scope).includes('document_pin');
  if (!canUse && !enabled && !q.isLoading) return null;

  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-3">
        {enabled
          ? <Lock className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" />
          : <LockOpen className="h-3.5 w-3.5 text-foreground/40" />}
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
          Document PIN
        </span>
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]',
            enabled
              ? 'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200'
              : 'border-foreground/15 bg-foreground/[0.04] text-foreground/55',
          )}
        >
          <span className={cn('h-1 w-1 rounded-full', enabled ? 'bg-teal-400' : 'bg-foreground/35')} />
          {enabled ? 'On' : 'Off'}
        </span>
      </div>

      <div className="px-5 py-4">
        {q.isLoading ? (
          <div className="grid place-items-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
          </div>
        ) : editing ? (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="doc-pin" className="mb-1 block text-[11px] text-foreground/60">
                New 4-digit PIN
              </label>
              <input
                id="doc-pin"
                inputMode="numeric"
                autoFocus
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-32 rounded-xl border border-foreground/15 bg-foreground/[0.03] px-3 py-2 text-center text-lg tracking-[0.4em] tabular-nums focus:border-teal-400/60 focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={pin.length !== 4 || save.isPending}
              onClick={() => save.mutate(pin)}
              className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3.5 py-2 text-xs font-semibold text-teal-50 hover:bg-teal-800 disabled:opacity-40"
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
              {enabled ? 'Replace PIN' : 'Set PIN'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setPin(''); }}
              className="text-xs text-foreground/55 underline hover:text-foreground/80"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground/65">
              {enabled ? (
                <>
                  Anyone here — including you — must enter the PIN to open{' '}
                  {clientName.split(' ')[0]}&apos;s files and photos. {clientName.split(' ')[0]} is
                  not asked for it; their own app opens as normal.
                  {lockedFor > 0 && (
                    <span className="mt-1 block text-amber-700 dark:text-amber-300">
                      Locked after too many wrong tries — {lockedFor} minute{lockedFor === 1 ? '' : 's'} left.
                      Setting a new PIN unlocks it straight away.
                    </span>
                  )}
                </>
              ) : (
                <>
                  Anyone with a login here can open their files and photos. Add a PIN if these
                  reports should not be seen by all of your staff.
                </>
              )}
            </div>
            {canUse && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-foreground/15 px-3.5 py-1.5 text-xs font-semibold text-foreground/80 hover:bg-foreground/[0.05]"
            >
              <Lock className="h-3.5 w-3.5" />
              {enabled ? 'Change PIN' : 'Set a PIN'}
            </button>
            )}
            {enabled && (
              <button
                type="button"
                disabled={clear.isPending}
                onClick={() => clear.mutate()}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/[0.06] px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-400/10 disabled:opacity-50 dark:text-rose-300"
              >
                {clear.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <LockOpen className="h-3 w-3" />}
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </Glass>
  );
}
