import { Body, Controller, Delete, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ApiKeysService } from './api-keys.service';

class CreateApiKeyDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
}

/**
 * API-key management for a workspace owner. Scale Pro only
 * (@RequireFeature('api_access')). The created key's plaintext is returned
 * once by POST and never again.
 */
@ApiTags('Workspace · API keys')
@ApiBearerAuth()
@RequireFeature('api_access')
@Controller({ path: 'workspaces/me/api-keys', version: '1' })
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  @WorkspaceRole('owner')
  async list(@CurrentUser() u: AuthUser) {
    if (!u.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.keys.list(u.workspaceId) };
  }

  @Post()
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Create an API key. The full key is returned ONCE.' })
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateApiKeyDto) {
    if (!u.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.keys.create(u.workspaceId, u.id, dto.name ?? 'API key') };
  }

  @Delete(':id')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Revoke an API key immediately.' })
  async revoke(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    if (!u.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.keys.revoke(u.workspaceId, id) };
  }
}
