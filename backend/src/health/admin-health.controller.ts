import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { PrismaService } from '../database/prisma.service';

interface DbCheck {
  status: 'up' | 'down';
  latency_ms: number | null;
  version: string | null;
  error?: string;
}

interface WebhookHealth {
  /** Errors in the last 24h. */
  errors_24h: number;
  /** Total events in last 24h. */
  events_24h: number;
  /** Latest received event timestamp. */
  last_event_at: string | null;
}

@ApiTags('Admin · Platform health')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/health', version: '1' })
export class AdminHealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Full platform health: process, DB, webhook ledger, env.' })
  async full() {
    const [db, webhooks, errors] = await Promise.all([
      this.dbCheck(),
      this.webhookHealth(),
      this.recentErrors(),
    ]);

    const mem = process.memoryUsage();

    return {
      data: {
        process: {
          uptime_seconds: Math.round(process.uptime()),
          node_version: process.version,
          memory: {
            rss_mb: Math.round(mem.rss / 1024 / 1024),
            heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
            heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
          },
          env: this.config.get<string>('NODE_ENV') ?? 'unknown',
        },
        database: db,
        webhooks,
        errors_24h: errors,
        flags: {
          razorpay_configured: !!this.config.get('RAZORPAY_WEBHOOK_SECRET'),
          gemini_configured: !!this.config.get('GEMINI_API_KEY'),
        },
      },
    };
  }

  private async dbCheck(): Promise<DbCheck> {
    const t0 = Date.now();
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ v: string }>>(
        `SELECT version() AS v`,
      );
      return {
        status: 'up',
        latency_ms: Date.now() - t0,
        version: rows[0]?.v ?? null,
      };
    } catch (err) {
      return {
        status: 'down',
        latency_ms: Date.now() - t0,
        version: null,
        error: (err as Error).message,
      };
    }
  }

  private async webhookHealth(): Promise<WebhookHealth> {
    try {
      const [row] = await this.prisma.$queryRawUnsafe<
        Array<{
          errors_24h: bigint;
          events_24h: bigint;
          last_at: Date | null;
        }>
      >(`
        SELECT
          COUNT(*) FILTER (WHERE error IS NOT NULL AND received_at >= now() - interval '24 hours')::bigint AS errors_24h,
          COUNT(*) FILTER (WHERE received_at >= now() - interval '24 hours')::bigint                       AS events_24h,
          MAX(received_at) AS last_at
        FROM public.webhook_events
      `);
      return {
        errors_24h: Number(row?.errors_24h ?? 0n),
        events_24h: Number(row?.events_24h ?? 0n),
        last_event_at: row?.last_at ? row.last_at.toISOString() : null,
      };
    } catch {
      return { errors_24h: 0, events_24h: 0, last_event_at: null };
    }
  }

  private async recentErrors(): Promise<{ ai_calls: number; webhooks: number }> {
    try {
      const [row] = await this.prisma.$queryRawUnsafe<
        Array<{ ai_errors: bigint; webhook_errors: bigint }>
      >(`
        SELECT
          (SELECT COUNT(*)::bigint
             FROM public.ai_usage_events
            WHERE status = 'error' AND created_at >= now() - interval '24 hours') AS ai_errors,
          (SELECT COUNT(*)::bigint
             FROM public.webhook_events
            WHERE error IS NOT NULL AND received_at >= now() - interval '24 hours') AS webhook_errors
      `);
      return {
        ai_calls: Number(row?.ai_errors ?? 0n),
        webhooks: Number(row?.webhook_errors ?? 0n),
      };
    } catch {
      return { ai_calls: 0, webhooks: 0 };
    }
  }
}