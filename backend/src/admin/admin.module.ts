import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../clients/push.module';
import { ConnectionsModule } from '../connections/connections.module';
import { AnnouncementsController } from './admin-announcements.controller';
import { AdminConfigController } from './admin-config.controller';
import { AdminPushController } from './admin-push.controller';
import { AdminUsersController } from './admin-users.controller';
import { DemoSwitchController } from './demo-switch.controller';
import { AdminWorkspacesController } from './admin-workspaces.controller';
import { AdminRetentionController } from './admin-retention.controller';
import { AdminSetupFeesController } from './admin-setup-fees.controller';
import { AdminWhatsappController } from './admin-whatsapp.controller';
import { AdminWorkspaceWhatsappController } from './admin-workspace-whatsapp.controller';
import { AdminService } from './admin.service';
import { RetentionService } from './retention.service';
import { AdminAuditController } from './audit/audit.controller';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditService } from './audit/audit.service';

/**
 * Platform-admin (super_admin) module. @Global so the AuditInterceptor
 * registered here as APP_INTERCEPTOR can resolve AuditService anywhere.
 */
@Global()
@Module({
  // AuthModule for AuthCacheService: granting/revoking super_admin must drop the
  // cached AuthUser, or the change doesn't take effect for up to its 120s TTL.
  imports: [PushModule, AuthModule, ConnectionsModule],
  controllers: [
    AdminWorkspacesController,
    AdminSetupFeesController,
    AdminRetentionController,
    AdminWhatsappController,
    AdminWorkspaceWhatsappController,
    AdminUsersController,
    AnnouncementsController,
    AdminConfigController,
    AdminAuditController,
    AdminPushController,
    // Not @SuperAdmin-gated as a class: the demo account owner uses it too,
    // so the check lives in the controller where both cases are visible.
    DemoSwitchController,
  ],
  providers: [
    AdminService,
    RetentionService,
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService, AdminService],
})
export class AdminModule {}
