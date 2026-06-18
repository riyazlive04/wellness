import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { ClientsService } from './clients.service';
import { CreateInviteDto } from './dto/invite.dto';
import { ListClientsQuery } from './dto/list-clients.query';

interface Attachment { url: string; type: string; name?: string; size?: number }

class SendAdminMessageDto {
  @IsOptional() @IsString() @MaxLength(4000) content?: string;
  @IsOptional() @IsObject() attachment?: Attachment;
  @IsOptional() @IsString() replyTo?: string;
  @IsOptional() @IsString() scheduledFor?: string;
}
class CreateQuickReplyDto {
  @IsString() @MaxLength(2000) body!: string;
  @IsOptional() @IsString() @MaxLength(60) label?: string;
}
class ReactDto {
  @IsString() @MaxLength(8) emoji!: string;
}
class EditMessageDto {
  @IsString() @MaxLength(4000) content!: string;
}
class PinDto {
  @IsBoolean() pinned!: boolean;
}

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
  @RequirePermission('clients.write')
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

  // ────────────────────────────────────────────────────────────────────
  // Messaging — workspace-admin side of the client chat
  // ────────────────────────────────────────────────────────────────────

  @Get('conversations')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List clients in this workspace with their latest message + unread count.' })
  async conversations(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.listWorkspaceConversations(user.workspaceId) };
  }

  @Get(':clientId/messages')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Full message thread for a single client in this workspace.' })
  async thread(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Query('limit') limit?: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    const n = limit ? Number(limit) : 200;
    return { data: await this.clients.clientMessageThread(user.workspaceId, clientId, Number.isFinite(n) ? n : 200) };
  }

  @Post(':clientId/messages')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Send a message FROM the admin TO this client (also push-notifies them).' })
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() body: SendAdminMessageDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.sendAdminMessage(user.workspaceId, user.id, clientId, {
      content: body.content, attachment: body.attachment, replyTo: body.replyTo, scheduledFor: body.scheduledFor,
    }) };
  }

  // ── Quick-reply templates (workspace-scoped) ──
  @Get('quick-replies')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List the workspace\'s quick-reply templates.' })
  async listQuickReplies(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.listQuickReplies(user.workspaceId) };
  }

  @Post('quick-replies')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(201)
  @ApiOperation({ summary: 'Save a quick-reply template.' })
  async createQuickReply(@CurrentUser() user: AuthUser, @Body() dto: CreateQuickReplyDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.createQuickReply(user.workspaceId, dto.body, dto.label) };
  }

  @Delete('quick-replies/:id')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a quick-reply template.' })
  async deleteQuickReply(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.deleteQuickReply(user.workspaceId, id) };
  }

  // ── Scheduled messages ──
  @Get(':clientId/scheduled')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List messages scheduled to send to this client.' })
  async scheduled(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.listScheduled(user.workspaceId, clientId) };
  }

  @Delete(':clientId/scheduled/:messageId')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a scheduled message.' })
  async cancelScheduled(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.cancelScheduled(user.workspaceId, messageId) };
  }

  @Post(':clientId/messages/read')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark all unread client→admin messages as read.' })
  async markRead(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.markThreadRead(user.workspaceId, clientId) };
  }

  @Post(':clientId/messages/:messageId/react')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  @ApiOperation({ summary: 'Toggle a reaction emoji on a message.' })
  async react(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string, @Body() dto: ReactDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.reactAdmin(user.workspaceId, messageId, dto.emoji) };
  }

  @Patch(':clientId/messages/:messageId')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Edit one of your own messages.' })
  async edit(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string, @Body() dto: EditMessageDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.editAdmin(user.workspaceId, messageId, dto.content) };
  }

  @Delete(':clientId/messages/:messageId')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a message — scope=me (hide for you) or everyone (default).' })
  async remove(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string, @Query('scope') scope?: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.deleteAdmin(user.workspaceId, messageId, scope === 'me' ? 'me' : 'everyone') };
  }

  @Post(':clientId/messages/:messageId/pin')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pin / unpin a message in the thread.' })
  async pin(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string, @Body() dto: PinDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.pinAdmin(user.workspaceId, messageId, dto.pinned) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Client wellness drill-down (nutritionist view)
  // ────────────────────────────────────────────────────────────────────

  @Get(':clientId/meals')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Recent meal logs for a client with frozen nutrition snapshots.' })
  async clientMeals(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Query('days') days?: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    const d = days ? Number(days) : 30;
    return { data: await this.clients.workspaceClientMeals(user.workspaceId, clientId, Number.isFinite(d) ? d : 30) };
  }

  @Get(':clientId/habits')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Daily habits (water, sleep, exercise, mood) for a client.' })
  async clientHabits(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Query('days') days?: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    const d = days ? Number(days) : 30;
    return { data: await this.clients.workspaceClientHabits(user.workspaceId, clientId, Number.isFinite(d) ? d : 30) };
  }

  @Get(':clientId/measurements')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Body measurements history for a client.' })
  async clientMeasurements(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.workspaceClientMeasurements(user.workspaceId, clientId) };
  }

  @Get(':clientId/nutrition-audit')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Nutrition Engine calculations for a client — every kcal value is traceable.' })
  async clientNutritionAudit(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Query('limit') limit?: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    const n = limit ? Number(limit) : 50;
    return { data: await this.clients.workspaceClientNutritionAudit(user.workspaceId, clientId, Number.isFinite(n) ? n : 50) };
  }

  @Get(':clientId/nutrition-trends')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Daily nutrition totals from frozen meal_log snapshots — fast SELECT, no recalc.' })
  async clientNutritionTrends(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Query('days') days?: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    const d = days ? Number(days) : 14;
    return { data: await this.clients.workspaceClientNutritionTrends(user.workspaceId, clientId, Number.isFinite(d) ? d : 14) };
  }
}