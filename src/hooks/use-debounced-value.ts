import { useEffect, useState } from 'react';

/**
 * Trailing-edge debounce for search inputs.
 *
 * The food library now queries on every keystroke (it browses when the box is
 * empty rather than waiting for two characters), so without this a five-letter
 * search fires five trigram queries against a 521-row table.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
