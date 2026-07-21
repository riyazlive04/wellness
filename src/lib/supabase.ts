/**
 * Supabase client for React Native.
 *
 * Differences from the web client (frontend/src/integrations/supabase/client.ts):
 *   - Uses AsyncStorage (RN has no localStorage) so the session persists.
 *   - detectSessionInUrl: false — there's no URL bar to parse OAuth hashes.
 *   - Requires the react-native-url-polyfill (imported once at app entry).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Add them to .env and restart the dev server with a cache clear (expo start -c).',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
