/**
 * Edit-on-top-of-server-state for forms.
 *
 * Replaces the usual `useState` + `useEffect(() => setForm(query.data))`
 * hydration dance, which the React Compiler (enabled for this app) flags as a
 * cascading render — and which has a subtler bug: once you add a `dirty` guard
 * to stop a background refetch clobbering typing, the form silently stops
 * tracking the server for the rest of the session.
 *
 * Here the rendered value is simply `{...server, ...edits}`. Untouched fields
 * follow the server; touched ones hold the user's text until `reset()` after a
 * successful save. No effect, no hydration race.
 */
import { useCallback, useMemo, useState } from 'react';

export interface Editable<T extends object> {
  /** Server values with the user's unsaved edits laid over them. */
  value: T;
  /** True once anything has been edited and not yet reset. */
  dirty: boolean;
  /** Only the edited fields — what you'd PATCH. */
  changes: Partial<T>;
  set: <K extends keyof T>(key: K, next: T[K]) => void;
  /** Curried setter for text inputs: `onChangeText={field('name')}`. */
  field: (key: keyof T) => (next: string) => void;
  patch: (next: Partial<T>) => void;
  /** Drop local edits and fall back to the server values. */
  reset: () => void;
}

export function useEditable<T extends object>(server: T): Editable<T> {
  const [edits, setEdits] = useState<Partial<T> | null>(null);

  const value = useMemo(() => (edits ? { ...server, ...edits } : server), [server, edits]);

  const set = useCallback(<K extends keyof T>(key: K, next: T[K]) => {
    setEdits((e) => ({ ...(e ?? {}), [key]: next }) as Partial<T>);
  }, []);

  const field = useCallback(
    (key: keyof T) => (next: string) => {
      setEdits((e) => ({ ...(e ?? {}), [key]: next }) as Partial<T>);
    },
    [],
  );

  const patch = useCallback((next: Partial<T>) => {
    setEdits((e) => ({ ...(e ?? {}), ...next }));
  }, []);

  const reset = useCallback(() => setEdits(null), []);

  return { value, dirty: edits !== null, changes: edits ?? {}, set, field, patch, reset };
}
