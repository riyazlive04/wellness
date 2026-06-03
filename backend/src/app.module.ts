import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AiVisionModule } from './ai-vision/ai-vision.module';
import { AiVoiceModule } from './ai-voice/ai-voice.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { BillingModule } from './billing/billing.module';
import { ClientsModule } from './clients/clients.module';
import { ComplianceModule } from './compliance/compliance.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { UsageModule } from './usage/usage.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { TenantModule } from './common/tenant/tenant.module';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './health/health.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60_000, limit: 200 },
    ]),
    PrismaModule,
    TenantModule,
    AuthModule,
    HealthModule,
    AiVoiceModule,
    AiVisionModule,
    WorkspacesModule,
    AdminModule,
    BillingModule,
    UsageModule,
    IntegrationsModule,
    ComplianceModule,
    ClientsModule,
  ],
  providers: [
    // Order matters — Nest evaluates global guards in registration order.
    // Throttle first (cheap reject), then auth (rejects no-token requests),
    // then RBAC (rejects authed-but-not-authorized).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Order matters: RequestId tags the request first, then TenantMiddleware
    // opens the AsyncLocalStorage context that JwtStrategy.validate() will
    // mutate once auth resolves.
    consumer.apply(RequestIdMiddleware, TenantMiddleware).forRoutes('*');
  }
}
