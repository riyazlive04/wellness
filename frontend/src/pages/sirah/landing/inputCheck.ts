import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

/**
 * AI checks for the landing page's free-text fields (see the backend's
 * LeadInputCheckService): is a name a real person's name, is "purpose of the
 * call" a real reason. The server runs the same check again at booking time;
 * this only warns the visitor early. A failed or unreachable check counts as
 * passed - it must never stand between someone and a booking.
 */

export type InputKind = 'name' | 'purpose';

export interface CheckState {
  status: 'idle' | 'checking' | 'ok' | 'bad';
  message?: string;
}

/** Answers already given this visit, so retyping the same text costs no AI call. */
const answered = new Map<string, CheckState>();

export async function checkInput(kind: InputKind, value: string): Promise<CheckState> {
  const key = `${kind}:${value.trim().toLowerCase()}`;
  const known = answered.get(key);
  if (known) return known;
  try {
    const res = await api.post<{ valid: boolean; message?: string }>(`/api/v1/public/leads/${kind}/check`, {
      body: kind === 'name' ? { name: value.trim() } : { purpose: value.trim() },
      skipAuth: true,
    });
    const state: CheckState = res?.valid === false ? { status: 'bad', message: res.message } : { status: 'ok' };
    answered.set(key, state);
    return state;
  } catch {
    return { status: 'idle' };
  }
}

/** Checks `value` once the visitor pauses typing, while `ready` holds. */
export function useInputCheck(kind: InputKind, value: string, ready: boolean, delayMs = 900): CheckState {
  const [state, setState] = useState<CheckState>({ status: 'idle' });

  useEffect(() => {
    if (!ready) {
      setState({ status: 'idle' });
      return;
    }
    let alive = true;
    setState({ status: 'checking' });
    const t = setTimeout(async () => {
      const result = await checkInput(kind, value);
      if (alive) setState(result);
    }, delayMs);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [kind, value, ready, delayMs]);

  return state;
}
