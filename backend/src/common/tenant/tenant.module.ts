import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

/**
 * Tenant context primitives. Global so JwtStrategy + future services can
 * inject TenantContextService without explicit imports.
 *
 * The middleware lives here but is registered in AppModule (NestModule.configure)
 * so it can run for every route.
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantModule {}
