/**
 * Supabase client for React Native.
 *
 * Differences from the web client (frontend/src/integrations/supabase/client.ts):
 *   - Uses AsyncStorage (RN has no localStorage) so the session persists.
 *   - detectSessionInUrl: false — there's no URL bar to parse OAuth hashes.
 *   - Requires the react-native-url-polyfill (imported once at app entry).
 *
 * Realtime: Node.js < 22 (Expo Metro host) has no native WebSocket, so
 * Supabase throws unless we pass `ws`. On device/browser, use global WebSocket.
 *
 * Storage: Expo web SSR runs in Node with no `window`. AsyncStorage crashes
 * there — use an in-memory shim during SSR, AsyncStorage everywhere else.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Add them to .env and restart the dev server with a cache clear (expo start -c).',
  );
}

const memory = new Map<string, string>();

/** Safe on RN, browser, and Node SSR (no window). */
const authStorage: SupportedStorage = {
  getItem: (key) => {
    if (typeof window === 'undefined') return Promise.resolve(memory.get(key) ?? null);
    return AsyncStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') {
      memory.set(key, value);
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') {
      memory.delete(key);
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  },
};

function realtimeTransport(): typeof WebSocket {
  if (typeof WebSocket !== 'undefined') {
    return WebSocket;
  }
  // Node.js < 22 (Expo Metro / web SSR) — no native WebSocket.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('ws') as typeof WebSocket;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    transport: realtimeTransport() as unknown as typeof WebSocket,
  },
});
