import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Surface missing env vars with a useful message before Supabase throws the
// opaque "supabaseUrl is required" error. Logs what Vite *did* inline so
// debugging a misconfigured deploy doesn't require source-mapping the bundle.
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  const allViteVars = Object.keys(import.meta.env)
    .filter((k) => k.startsWith('VITE_'))
    .join(', ') || '(none)';
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!SUPABASE_PUBLISHABLE_KEY) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');

  // eslint-disable-next-line no-console
  console.error(
    [
      '[supabase-client] Frontend env vars are missing at build time.',
      `Missing: ${missing.join(', ')}`,
      `VITE_* vars Vite saw: ${allViteVars}`,
      'Mode: ' + import.meta.env.MODE,
      '',
      'Fix:',
      '  1. Vercel → Settings → Environment Variables',
      '  2. Add the missing vars (names MUST start with VITE_)',
      '  3. Tick the Production environment for each',
      '  4. Deployments → ⋯ → Redeploy → UNCHECK "Use existing Build Cache"',
    ].join('\n'),
  );

  // Render a visible diagnostic instead of a blank page. main.tsx hasn't
  // mounted yet — root is empty, so writing directly is safe.
  if (typeof document !== 'undefined') {
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="font-family: system-ui, -apple-system, sans-serif; padding: 48px; max-width: 640px; margin: 0 auto; color: #1f2937">
          <h1 style="color: #ef4444; margin-bottom: 16px">⚠️ Frontend config error</h1>
          <p style="font-size: 16px; line-height: 1.6">The deployed bundle is missing required env vars:</p>
          <ul style="font-family: ui-monospace, monospace; background: #fef2f2; padding: 16px 24px; border-radius: 8px; border: 1px solid #fecaca">
            ${missing.map((v) => `<li>${v}</li>`).join('')}
          </ul>
          <p style="font-size: 14px; color: #6b7280; margin-top: 24px">
            <strong>VITE_* vars Vite saw in this build:</strong>
            <code style="display: block; background: #f3f4f6; padding: 8px 12px; border-radius: 6px; margin-top: 8px">${allViteVars}</code>
          </p>
          <p style="font-size: 14px; margin-top: 24px"><strong>Fix:</strong></p>
          <ol style="font-size: 14px; line-height: 1.8">
            <li>Vercel → Settings → Environment Variables</li>
            <li>Add the missing vars (names <strong>must</strong> start with <code>VITE_</code>)</li>
            <li>Tick the <strong>Production</strong> environment for each</li>
            <li>Deployments → ⋯ → Redeploy → <strong>UNCHECK</strong> "Use existing Build Cache"</li>
          </ol>
        </div>
      `;
    }
  }
  throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});