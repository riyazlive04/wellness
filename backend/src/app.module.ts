import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from './common/cache/cache.module';
import { ActivityLogModule } from './activity-log/activity-log.module';
import { AdminModule } from './admin/admin.module';
import { AutomationModule } from './automation/automation.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AiVisionModule } from './ai-vision/ai-vision.module';
import { PlateVisionModule } from './plate-vision/plate-vision.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { AiVoiceModule } from './ai-voice/ai-voice.module';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module';
import { WellnessModule } from './wellness/wellness.module';
import { ProgramsModule } from './programs/programs.module';
import { BarcodeModule } from './barcode/barcode.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { CommunityModule } from './community/community.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { EnterpriseAiModule } from './enterprise-ai/enterprise-ai.module';
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
import { NutritionEngineModule } from './nutrition-engine/nutrition-engine.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { WorkspaceRecipesModule } from './workspace-recipes/workspace-recipes.module';
import { SessionsModule } from './sessions/sessions.module';
import { ReportsModule } from './reports/reports.module';
import { MailModule } from './mail/mail.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { DataPrivacyModule } from './data-privacy/data-privacy.module';
import { PoliciesModule } from './policies/policies.module';
import { VerificationModule } from './verification/verification.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';

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
    ScheduleModule.forRoot(),
    PrismaModule,
    TenantModule,
    CacheModule,
    AuthModule,
    ActivityLogModule,
    HealthModule,
    AiVoiceModule,
    AiVisionModule,
    PlateVisionModule,
    WorkspacesModule,
    DataPrivacyModule,
    PoliciesModule,
    VerificationModule,
    NotificationsModule,
    SearchModule,
    AdminModule,
    BillingModule,
    AiAssistantModule,
    WellnessModule,
    ProgramsModule,
    BarcodeModule,
    CollaborationModule,
    CommunityModule,
    AnalyticsModule,
    EnterpriseAiModule,
    UsageModule,
    IntegrationsModule,
    ComplianceModule,
    ClientsModule,
    NutritionEngineModule,
    OrganizationsModule,
    WorkspaceRecipesModule,
    SessionsModule,
    ReportsModule,
    MailModule,
    AutomationModule,
    RealtimeModule,
    TenancyModule,
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
