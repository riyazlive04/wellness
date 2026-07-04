import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_JWT_SECRET: z.string().min(20, 'SUPABASE_JWT_SECRET looks too short'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY looks too short'),

  GEMINI_API_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),

  // Razorpay — all optional. Webhook handler returns 503 until secret is set,
  // letting the rest of billing observability work in test environments.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  // Razorpay plan IDs — one per tier. Create the plans in Razorpay Dashboard
  // → Subscriptions → Plans, then drop the resulting plan_XXX into env.
  // Without these, /billing/me/subscribe will refuse to start a recurring
  // subscription for that tier (top-up orders still work).
  RAZORPAY_PLAN_ID_BASIC: z.string().optional(),
  RAZORPAY_PLAN_ID_PRO: z.string().optional(),
  RAZORPAY_PLAN_ID_ELITE: z.string().optional(),

  // VAPID keys for web push. Generate with `npx web-push generate-vapid-keys`
  // and drop both into env. Subject is a mailto: that browsers display in
  // their permission UI (it's the contact for the application server).
  // If not set, /me/push/config returns enabled:false and the frontend
  // hides the "enable push" button.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:support@sirahdigital.in'),

  // Evolution API — WhatsApp messaging gateway. URL points at your Evolution
  // server (self-hosted or cloud); INSTANCE_NAME is the named WhatsApp number.
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE_NAME: z.string().optional(),

  // Google OAuth — these live in Supabase Dashboard → Auth → Providers, but
  // we mirror them in env as a marker so the integrations dashboard can
  // detect "configured" without round-tripping the Supabase Management API.
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return result.data;
}
