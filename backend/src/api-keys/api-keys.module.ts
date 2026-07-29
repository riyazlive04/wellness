import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysController } from './api-keys.controller';
import { PublicApiController } from './public-api.controller';

/**
 * Workspace API keys — the Scale Pro "API access" feature.
 * TenancyModule provides LimitsService (used by ApiKeyGuard to re-check the
 * plan on every key-authed request). PrismaService is global.
 */
@Module({
  imports: [TenancyModule],
  controllers: [ApiKeysController, PublicApiController],
  providers: [ApiKeysService, ApiKeyGuard],
})
export class ApiKeysModule {}
