import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { ClientsService } from './clients.service';
import { CreateInviteDto } from './dto/invite.dto';
import { ListClientsQuery } from './dto/list-clients.query';

/**
 * Workspace-admin (owner / nutritionist) client management.
 * RolesGuard enforces both presence of a workspace AND the WorkspaceRole guard.
 */
@ApiTags('Workspace · Clients')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/clients', version: '1' })
export class WorkspaceClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List clients of the caller\'s workspace.' })
  async list(@CurrentUser() user: AuthUser, @Query() q: ListClientsQuery) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.listClients(user.workspaceId, q) };
  }

  @Get('invites')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List every invite (pending / accepted / revoked / expired) in this workspace.' })
  async listInvites(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.listInvites(user.workspaceId) };
  }

  @Post('invite')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(201)
  @ApiOperation({ summary: 'Issue a fresh client invite (returns token for share-link).' })
  async invite(@CurrentUser() user: AuthUser, @Body() dto: CreateInviteDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    const invite = await this.clients.createInvite(
      user.workspaceId,
      user.id,
      dto.email,
      dto.name,
      dto.notes,
    );
    return { data: invite };
  }

  @Post('invites/:id/revoke')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke a still-pending invite.' })
  async revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.revokeInvite(user.workspaceId, id, user.id) };
  }
}