import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AnnouncementsController } from './admin-announcements.controller';
import { AdminConfigController } from './admin-config.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminWorkspacesController } from './admin-workspaces.controller';
import { AdminService } from './admin.service';
import { AdminAuditController } from './audit/audit.controller';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditService } from './audit/audit.service';

/**
 * Platform-admin (super_admin) module. @Global so the AuditInterceptor
 * registered here as APP_INTERCEPTOR can resolve AuditService anywhere.
 */
@Global()
@Module({
  controllers: [
    AdminWorkspacesController,
    AdminUsersController,
    AnnouncementsController,
    AdminConfigController,
    AdminAuditController,
  ],
  providers: [
    AdminService,
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AdminModule {}
