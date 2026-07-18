import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpCacheInterceptor } from './common/cache/http-cache.interceptor';
import { CacheService } from './common/cache/cache.service';

// Prisma returns BigInt for count()/sum() aggregate columns, and JSON.stringify
// throws "Do not know how to serialize a BigInt" — which 500s any endpoint that
// returns one (analytics, collaboration) and can crash the response-cache write.
// Teach JSON to emit BigInts as plain numbers (our BigInts are small aggregate
// counts, well within Number's safe range). Runs once at module load, before the
// app — every JSON.stringify (Express responses AND the cache) is then safe.
(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function toJSON(this: bigint): number {
  return Number(this);
};

// Bootstrap the Nest application.
async function bootstrap(): Promise<void> {
  // rawBody: true exposes req.rawBody so RazorpayWebhookService can HMAC-verify
  // the exact bytes Razorpay signed (the parsed JSON loses whitespace/ordering).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Workspace branding stores the logo as a small (~256px) data: URI, which the
  // UpdateWorkspaceDto allows up to ~500KB. Express/Nest default the JSON body
  // to 100KB, so a photo logo would 413 and silently fail to persist. Raise the
  // limit to comfortably fit it. `rawBody: true` is preserved by useBodyParser
  // (it re-reads appOptions.rawBody), so Razorpay webhook HMAC verification is
  // unaffected.
  app.useBodyParser('json', { limit: '2mb' });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(helmet());
  // .trim() defends against trailing newline / whitespace in env vars —
  // Node's HTTP layer rejects headers containing control chars and would
  // crash with ERR_INVALID_CHAR on every request. Dashboards (Render,
  // Vercel) sometimes invisibly append a \n when pasting URLs.
  // FRONTEND_ORIGIN may be a comma-separated list so the old + new domains (and
  // the local dev server) can all be allowed at once during a domain cutover.
  const allowedOrigins = config
    .getOrThrow<string>('FRONTEND_ORIGIN')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // Order matters: TransformInterceptor is OUTERMOST (adds a fresh requestId to
  // every response), HttpCacheInterceptor is INNERMOST (caches the pure payload
  // per tenant+user across all GET sections). Redis-backed when REDIS_URL is set.
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new HttpCacheInterceptor(app.get(CacheService), app.get(Reflector)),
  );

  if (config.get<string>('NODE_ENV') !== 'production') {
    const swagger = new DocumentBuilder()
      .setTitle('Sheizen API')
      .setDescription('Backend API for the Sheizen Wellness platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup('api/docs', app, doc);
    logger.log('Swagger UI available at /api/docs');
  }

  app.enableShutdownHooks();

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  logger.log(`Sheizen API listening on http://localhost:${port}/api/v1`);

  // ── Keep-warm self-ping ────────────────────────────────────────────────
  // Render's free tier spins the service down after ~15 min without inbound
  // traffic; the next request then pays a 30–60s cold start (the "data loads
  // slowly" symptom). Pinging our own PUBLIC health URL every ~10 min keeps the
  // instance awake. Production-only, and no-ops unless a public URL is known
  // (Render sets RENDER_EXTERNAL_URL automatically; KEEP_WARM_URL overrides).
  const keepWarmBase = (process.env.KEEP_WARM_URL || process.env.RENDER_EXTERNAL_URL || '').trim();
  if (config.get<string>('NODE_ENV') === 'production' && keepWarmBase) {
    const healthUrl = `${keepWarmBase.replace(/\/+$/, '')}/api/v1/health`;
    const KEEP_WARM_MS = 10 * 60 * 1000;
    setInterval(() => {
      void fetch(healthUrl).catch(() => { /* transient network blip - next tick retries */ });
    }, KEEP_WARM_MS).unref();
    logger.log(`Keep-warm ping every ${KEEP_WARM_MS / 60000}m → ${healthUrl}`);
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
