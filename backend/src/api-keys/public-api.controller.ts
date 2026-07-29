import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ApiKeyGuard } from './api-key.guard';
import { ApiWorkspaceId } from './api-workspace.decorator';
import { ApiKeysService } from './api-keys.service';

/**
 * Public REST API authenticated by workspace API key (not a user JWT).
 * `@Public()` skips the global JwtAuthGuard; the global Roles/Features guards
 * are no-ops here (no metadata); ApiKeyGuard is the sole authenticator and
 * scopes every response to the key's workspace.
 *
 * Base: /api/v1/public   ·   Auth: header `X-API-Key: sk_live_…`
 */
@ApiTags('Public API (key auth)')
@ApiSecurity('api_key')
@Public()
@UseGuards(ApiKeyGuard)
@Controller({ path: 'public', version: '1' })
export class PublicApiController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get('ping')
  @ApiOperation({ summary: 'Verify your API key — returns your workspace id.' })
  ping(@ApiWorkspaceId() workspaceId: string) {
    return { ok: true, workspace_id: workspaceId };
  }

  @Get('clients')
  @ApiOperation({ summary: 'List clients in your workspace.' })
  async clients(
    @ApiWorkspaceId() workspaceId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return { data: await this.keys.listClients(workspaceId, Number(limit) || 50, Number(offset) || 0) };
  }

  @Get('clients/:id')
  @ApiOperation({ summary: 'Fetch one client by id.' })
  async client(@ApiWorkspaceId() workspaceId: string, @Param('id') id: string) {
    return { data: await this.keys.getClient(workspaceId, id) };
  }
}
