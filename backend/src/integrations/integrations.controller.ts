import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';

interface IntegrationStatus {
  key: string;
  name: string;
  category: 'payments' | 'ai' | 'email' | 'sms' | 'monitoring' | 'analytics' | 'storage';
  status: 'connected' | 'partial' | 'not_configured';
  /** Short note shown beneath the status pill (e.g. "Webhook secret missing"). */
  detail: string;
  /** Env vars this integration needs. */
  env_keys: string[];
  /** Which env vars are currently SET (not which values, just presence). */
  env_present: string[];
  docs_url?: string;
}

interface DescriptorInput {
  key: string;
  name: string;
  category: IntegrationStatus['category'];
  envKeys: string[];
  requiredKeys?: string[];
  docs?: string;
  successDetail?: string;
  partialDetail?: (missing: string[]) => string;
}

/**
 * Discovers integration status by reading env presence. No secrets in the
 * response — only which keys exist + how to add the missing ones. Inserting
 * new integrations is a 5-line change in INTEGRATIONS below.
 */
@ApiTags('Admin · Integrations')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/integrations', version: '1' })
export class IntegrationsController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @ApiOperation({ summary: 'List every external integration and its configuration state.' })
  list() {
    const items = INTEGRATIONS.map((d) => this.materialise(d));
    const summary = {
      total: items.length,
      connected: items.filter((i) => i.status === 'connected').length,
      partial: items.filter((i) => i.status === 'partial').length,
      missing: items.filter((i) => i.status === 'not_configured').length,
    };
    return { data: { items, summary } };
  }

  private materialise(d: DescriptorInput): IntegrationStatus {
    const required = d.requiredKeys ?? d.envKeys;
    const present = d.envKeys.filter((k) => !!this.config.get<string>(k));
    const requiredMissing = required.filter((k) => !this.config.get<string>(k));
    let status: IntegrationStatus['status'];
    let detail: string;
    if (requiredMissing.length === 0) {
      status = present.length === d.envKeys.length ? 'connected' : 'partial';
      detail = status === 'connected'
        ? (d.successDetail ?? 'All keys present.')
        : `Optional: ${d.envKeys.filter((k) => !present.includes(k)).join(', ')} not set.`;
    } else if (present.length === 0) {
      status = 'not_configured';
      detail = `Add ${requiredMissing.join(', ')} to backend/.env.local to enable.`;
    } else {
      status = 'partial';
      detail = d.partialDetail
        ? d.partialDetail(requiredMissing)
        : `Missing: ${requiredMissing.join(', ')}.`;
    }
    return {
      key: d.key,
      name: d.name,
      category: d.category,
      status,
      detail,
      env_keys: d.envKeys,
      env_present: present,
      docs_url: d.docs,
    };
  }
}

const INTEGRATIONS: DescriptorInput[] = [
  {
    key: 'razorpay',
    name: 'Razorpay',
    category: 'payments',
    envKeys: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
    requiredKeys: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
    docs: 'https://razorpay.com/docs/webhooks/',
    successDetail: 'Payments + webhooks armed. Receiving /api/v1/webhooks/razorpay.',
  },
  {
    key: 'gemini',
    name: 'Google Gemini',
    category: 'ai',
    envKeys: ['GEMINI_API_KEY'],
    docs: 'https://ai.google.dev/gemini-api/docs',
    successDetail: 'Voice + vision endpoints can hit Gemini 2.5.',
  },
  {
    key: 'supabase',
    name: 'Supabase (Postgres + Auth)',
    category: 'storage',
    envKeys: ['SUPABASE_URL', 'SUPABASE_JWT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL'],
    docs: 'https://supabase.com/docs',
    successDetail: 'Auth + Postgres + service-role admin SDK all configured.',
  },
  {
    key: 'redis',
    name: 'Redis (queues / cache)',
    category: 'storage',
    envKeys: ['REDIS_URL'],
    requiredKeys: [],
    successDetail: 'Optional. Set REDIS_URL when you add background workers.',
  },
  {
    key: 'resend',
    name: 'Resend (transactional email)',
    category: 'email',
    envKeys: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'],
    docs: 'https://resend.com/docs',
  },
  {
    key: 'twilio',
    name: 'Twilio (SMS + WhatsApp)',
    category: 'sms',
    envKeys: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
    docs: 'https://www.twilio.com/docs',
  },
  {
    key: 'sentry',
    name: 'Sentry (error tracking)',
    category: 'monitoring',
    envKeys: ['SENTRY_DSN', 'SENTRY_TRACES_SAMPLE_RATE'],
    requiredKeys: ['SENTRY_DSN'],
    docs: 'https://docs.sentry.io/platforms/node/guides/nestjs/',
  },
  {
    key: 'posthog',
    name: 'PostHog (product analytics)',
    category: 'analytics',
    envKeys: ['POSTHOG_API_KEY', 'POSTHOG_HOST'],
    requiredKeys: ['POSTHOG_API_KEY'],
    docs: 'https://posthog.com/docs',
  },
];