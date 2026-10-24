import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, ShieldAlert } from 'lucide-react';

import { Glass } from '@/design-system';
import { ApiError } from '@/lib/api';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Asks whoever is looking for the PIN the practice put on this client's
 * documents.
 *
 * Wraps the Files and Photos tabs. Everyone sees this - the owner, an
 * assistant, a receptionist - because the point is that not every member of
 * staff should be able to open every client's reports.
 *
 * The unlock is server-side, keyed on the client AND the viewer, so entering
 * it here does not open the record for a colleague at the next desk.
 */
export function DocumentPinPrompt({
  clientId,
  clientName,
  children,
}: {
  clientId: string;
  clientName: string;
  children: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stateQ = useQuery({
    queryKey: ['client', clientId, 'document-pin'],
    queryFn: () => clientsApi.documentPinStatus(clientId),
    staleTime: 0,
  });

  const verify = useMutation({
    mutationFn: (code: string) => clientsApi.verifyDocumentPin(clientId, code),
    onSuccess: (r) => {
      if (r.ok) {
        setError(null);
        setPin('');
        setUnlocked(true);
        // The reads were refused while locked; fetch them now.
        qc.invalidateQueries({ queryKey: ['client', clientId, 'files'] });
        qc.invalidateQueries({ queryKey: ['client', clientId, 'photos'] });
        qc.invalidateQueries({ queryKey: ['client', clientId, 'document-pin'] });
        return;
      }
      setPin('');
      setError(
        r.locked_minutes > 0
          ? `Too many wrong tries. Locked for ${r.locked_minutes} minute${r.locked_minutes === 1 ? '' : 's'}. Setting a new PIN unlocks it straight away.`
          : `Wrong PIN. ${r.attempts_left} ${r.attempts_left === 1 ? 'try' : 'tries'} left.`,
      );
      inputRef.current?.focus();
    },
    onError: (e) => {
      setPin('');
      setError(e instanceof ApiError ? e.message : 'Could not check that PIN.');
    },
  });

  // Four digits is the whole code, so there is nothing to press afterwards.
  useEffect(() => {
    if (pin.length === 4 && !verify.isPending) verify.mutate(pin);
    // verify.mutate is stable for the life of the mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const needsPin = !!stateQ.data?.enabled && !unlocked;

  useEffect(() => {
    if (needsPin) inputRef.current?.focus();
  }, [needsPin]);

  // Until we know, show nothing rather than flashing the documents and then
  // hiding them - a glimpse of a lab report defeats the point.
  if (stateQ.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  // The status check failed. Render the children: the server gates the reads
  // independently, so the worst case is an empty tab, never a leak.
  if (stateQ.isError || !needsPin) return <>{children}</>;

  const lockedFor = stateQ.data?.locked_minutes ?? 0;

  return (
    <Glass className="mx-auto max-w-md p-7 text-center">
      <span
        className={cn(
          'mx-auto grid h-14 w-14 place-items-center rounded-full',
          lockedFor > 0
            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
            : 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
        )}
      >
        {lockedFor > 0 ? <ShieldAlert className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
      </span>

      <h3 className="mt-4 text-base font-semibold">
        {lockedFor > 0 ? 'Locked for now' : 'These documents are protected'}
      </h3>
      <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-foreground/60">
        {lockedFor > 0
          ? `Too many wrong tries. This unlocks again in ${lockedFor} minute${lockedFor === 1 ? '' : 's'}, or straight away if the PIN is replaced.`
          : `Enter the 4-digit PIN set on ${clientName.split(' ')[0]}'s documents.`}
      </p>

      {lockedFor === 0 && (
        <>
          <input
            ref={inputRef}
            inputMode="numeric"
            type="password"
            autoComplete="off"
            maxLength={4}
            value={pin}
            disabled={verify.isPending}
            onChange={(e) => {
              setError(null);
              setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
            }}
            aria-label="4-digit document PIN"
            className="mx-auto mt-5 block w-40 rounded-2xl border border-foreground/15 bg-foreground/[0.03] px-4 py-3 text-center text-2xl tracking-[0.5em] tabular-nums focus:border-teal-400/60 focus:bg-foreground/[0.06] focus:outline-none disabled:opacity-50"
          />
          {verify.isPending && (
            <div className="mt-3 inline-flex items-center gap-2 text-xs text-foreground/55">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
            </div>
          )}
        </>
      )}

      {error && <p className="mt-4 text-sm text-rose-600 dark:text-rose-300">{error}</p>}

      <p className="mt-6 text-[11px] leading-relaxed text-foreground/45">
        Set by this practice so not everyone with a login can open a client&apos;s reports.
        It unlocks for you alone, for 15 minutes.
      </p>
    </Glass>
  );
}
