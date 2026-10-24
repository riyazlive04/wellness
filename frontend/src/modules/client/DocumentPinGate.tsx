import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, ShieldAlert } from 'lucide-react';

import { Glass } from '@/design-system';
import { ApiError } from '@/lib/api';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Asks for the 4-digit PIN a practice set on this client's documents.
 *
 * Wraps the Files and Progress photo screens: while a PIN is required and not
 * yet entered, the children are not rendered at all, so no document request is
 * even made. The server gates the same reads independently - this is the
 * prompt, not the protection.
 *
 * The unlock lives server-side on a short timer, so nothing here needs to be
 * remembered, and closing the app re-locks by itself.
 */
export function DocumentPinGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stateQ = useQuery({
    queryKey: ['me', 'document-pin'],
    queryFn: () => clientsApi.myDocumentPin(),
    // Re-checked on mount: the practice may have set or cleared it since.
    staleTime: 0,
    retry: 1,
  });

  const verify = useMutation({
    mutationFn: (code: string) => clientsApi.verifyMyDocumentPin(code),
    onSuccess: (r) => {
      if (r.ok) {
        setError(null);
        setPin('');
        // Documents are open now: let the wrapped screens fetch.
        qc.invalidateQueries({ queryKey: ['me', 'document-pin'] });
        qc.invalidateQueries({ queryKey: ['me', 'files'] });
        qc.invalidateQueries({ queryKey: ['me', 'progress-photos'] });
        return;
      }
      setPin('');
      setError(
        r.locked_minutes > 0
          ? `Too many wrong tries. Try again in ${r.locked_minutes} minute${r.locked_minutes === 1 ? '' : 's'}, or ask your nutritionist to reset it.`
          : `That PIN is not right. ${r.attempts_left} ${r.attempts_left === 1 ? 'try' : 'tries'} left.`,
      );
      inputRef.current?.focus();
    },
    onError: (e) => {
      setPin('');
      setError(e instanceof ApiError ? e.message : 'Could not check that PIN.');
    },
  });

  // Submit as soon as the fourth digit is typed - nobody wants to press
  // enter after four keystrokes on a phone.
  useEffect(() => {
    if (pin.length === 4 && !verify.isPending) verify.mutate(pin);
    // verify.mutate is stable for the life of the mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  useEffect(() => {
    if (stateQ.data?.required) inputRef.current?.focus();
  }, [stateQ.data?.required]);

  // Until we know, show nothing rather than flashing the documents and then
  // hiding them - a flash of a lab report defeats the point.
  if (stateQ.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  // The check failed (offline, server down). Let them through rather than
  // locking them out of their own records: the server gates the reads anyway,
  // so the worst case is an empty screen, not an exposed document.
  if (stateQ.isError || !stateQ.data?.required) return <>{children}</>;

  const locked = (stateQ.data.locked_minutes ?? 0) > 0;

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Glass className="p-7 text-center">
        <span
          className={cn(
            'mx-auto grid h-14 w-14 place-items-center rounded-full',
            locked ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                   : 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
          )}
        >
          {locked ? <ShieldAlert className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
        </span>

        <h2 className="mt-4 text-lg font-semibold">
          {locked ? 'Locked for now' : 'Enter your PIN'}
        </h2>
        <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-foreground/60">
          {locked
            ? `Too many wrong tries. This unlocks again in ${stateQ.data.locked_minutes} minute${stateQ.data.locked_minutes === 1 ? '' : 's'}.`
            : 'Your nutritionist put a 4-digit PIN on your documents. Enter it to see your files and photos.'}
        </p>

        {!locked && (
          <>
            <input
              ref={inputRef}
              // inputMode numeric brings up the number pad without the
              // spinner arrows a number input would add.
              inputMode="numeric"
              autoComplete="one-time-code"
              type="password"
              maxLength={4}
              value={pin}
              disabled={verify.isPending}
              onChange={(e) => {
                setError(null);
                setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
              }}
              aria-label="4-digit document PIN"
              className="mx-auto mt-6 block w-40 rounded-2xl border border-foreground/15 bg-foreground/[0.03] px-4 py-3 text-center text-2xl tracking-[0.5em] tabular-nums focus:border-teal-400/60 focus:bg-foreground/[0.06] focus:outline-none disabled:opacity-50"
            />
            {verify.isPending && (
              <div className="mt-3 inline-flex items-center gap-2 text-xs text-foreground/55">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
              </div>
            )}
          </>
        )}

        {error && (
          <p className="mt-4 text-sm text-rose-600 dark:text-rose-300">{error}</p>
        )}

        <p className="mt-6 text-xs text-foreground/45">
          Forgotten it? Your nutritionist can set a new one for you.
        </p>
      </Glass>
    </div>
  );
}
