import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/lib/api';

interface UADataLike {
  getHighEntropyValues?: (hints: string[]) => Promise<{
    model?: string;
    platform?: string;
    platformVersion?: string;
  }>;
}

/**
 * Captures the real device model for the current login session via User-Agent
 * Client Hints (modern browsers strip the model from the UA string), then sends
 * it to the backend so Settings → Security can show "Pixel 7" instead of a
 * generic "Android phone". Runs once per session; no-op on browsers without
 * Client Hints (Safari/Firefox/iOS) — those just keep the generic label.
 */
export function DeviceRegistrar() {
  useEffect(() => {
    const uaData = (navigator as unknown as { userAgentData?: UADataLike }).userAgentData;
    if (!uaData?.getHighEntropyValues) return;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const part = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
        const sid = part ? (JSON.parse(atob(part))?.session_id as string | undefined) : undefined;
        if (!sid) return;
        if (localStorage.getItem('device-registered') === sid) return;

        const hv = await uaData.getHighEntropyValues!(['model', 'platform', 'platformVersion']);
        localStorage.setItem('device-registered', sid); // mark even if empty, to avoid retries
        if (!hv?.model) return;
        await api.post('/api/v1/me/sessions/device', {
          body: { model: hv.model, platform: hv.platform, platformVersion: hv.platformVersion },
        });
      } catch {
        /* best-effort — device labelling is non-critical */
      }
    })();
  }, []);

  return null;
}
