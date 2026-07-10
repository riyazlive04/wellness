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
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
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
class AssignCoachDto {
  /** Coach's user id, or null/omitted to unassign. */
  @IsOptional() @IsString() coachUserId?: string | null;
}
class AssignAssessmentDto {
  /** A built-in assessment to send (health / stress / sleep). */
  @IsOptional() @IsIn(['health', 'stress', 'sleep']) type?: 'health' | 'stress' | 'sleep';
  /** …or the id of a workspace-authored custom form. */
  @IsOptional() @IsString() templateId?: string;
}
class ReviewAssessmentDto {
  /** Optional feedback the client will see on their portal. */
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
class ClientNoteDto {
  @IsString() @MaxLength(5000) content!: string;
}
class ImportClientRowDto {
  // Plain string (not @IsEmail) so one bad row is skipped + reported by the
  // service rather than 400-ing the whole import.
  @IsString() @MaxLength(160) email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}
class ImportClientsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportClientRowDto)
  rows!: ImportClientRowDto[];
}
class FileUploadTicketDto {
  @IsString() @MaxLength(200) file_name!: string;
}
class ShareFileDto {
  @IsString() storage_key!: string;
  @IsString() @MaxLength(255) file_name!: string;
  @IsOptional() @IsString() @MaxLength(150) file_type?: string;
  @IsOptional() @IsInt() @Min(0) file_size?: number;
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
  @WorkspaceRole('owner', 'nutritionist', 'coach')
  @ApiOperation({ summary: 'List clients of the caller\'s workspace (coaches see only their assigned clients).' })
  async list(@CurrentUser() user: AuthUser, @Query() q: ListClientsQuery) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    // Coaches are scoped to their own caseload; owners/nutritionists see all.
    const assignedCoachUserId = user.workspaceRole === 'coach' ? user.id : undefined;
    return { data: await this.clients.listClients(user.workspaceId, { ...q, assignedCoachUserId }) };
  }

  @Get('coaches')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List staff who can be assigned as a client\'s coach.' })
  async coaches(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.listAssignableCoaches(user.workspaceId) };
  }

  @Patch(':clientId/coach')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Assign (or clear) the coach responsible for a client.' })
  async assignCoach(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() dto: AssignCoachDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.assignCoach(user.workspaceId, clientId, dto.coachUserId ?? null) };
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

  @Post('import')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bulk-import clients from CSV rows — each becomes an invite (idempotent).' })
  async import(@CurrentUser() user: AuthUser, @Body() dto: ImportClientsDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.importClients(user.workspaceId, user.id, dto.rows) };
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

  @Get(':clientId/profile')
  @WorkspaceRole('owner', 'nutritionist', 'coach')
  @ApiOperation({ summary: 'Wellness profile a client maintains in their Settings (age, gender, allergies, goals…).' })
  async clientProfile(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.workspaceClientProfile(user.workspaceId, clientId) };
  }

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

  @Get(':clientId/cycle')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Menstrual-cycle events logged by a client (period, ovulation, symptoms).' })
  async clientCycle(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Query('days') days?: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    const d = days ? Number(days) : 180;
    return { data: await this.clients.workspaceClientCycle(user.workspaceId, clientId, Number.isFinite(d) ? d : 180) };
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

  // ────────────────────────────────────────────────────────────────────
  // Assessments — assign a Health / Stress / Sleep questionnaire to a client
  // ────────────────────────────────────────────────────────────────────

  @Get('assessments/recent')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Recently completed assessments across the workspace (dashboard feed).' })
  async recentAssessments(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    const n = limit ? Number(limit) : 6;
    return { data: await this.clients.recentCompletedAssessments(user.workspaceId, Number.isFinite(n) ? n : 6) };
  }

  @Get(':clientId/assessments')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List assessments assigned to a client (with responses).' })
  async listAssessments(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.listClientAssessments(user.workspaceId, clientId) };
  }

  @Post(':clientId/assessments')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Assign a Health / Stress / Sleep assessment to a client.' })
  async assignAssessment(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() dto: AssignAssessmentDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return {
      data: await this.clients.assignAssessment(user.workspaceId, clientId, {
        type: dto.type,
        templateId: dto.templateId,
      }),
    };
  }

  @Post(':clientId/assessments/:cardId/review')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a client assessment as reviewed, with an optional note the client sees.' })
  async reviewAssessment(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Param('cardId') cardId: string,
    @Body() dto: ReviewAssessmentDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.reviewClientAssessment(user.workspaceId, clientId, cardId, dto.note ?? null) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Private notes the nutritionist keeps on a client (never shown to client)
  // ────────────────────────────────────────────────────────────────────

  @Get(':clientId/notes')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List the workspace\'s private notes on a client.' })
  async listNotes(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.listClientNotes(user.workspaceId, clientId) };
  }

  @Post(':clientId/notes')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a private note about a client.' })
  async addNote(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string, @Body() dto: ClientNoteDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.createClientNote(user.workspaceId, user.id, clientId, dto.content) };
  }

  @Patch(':clientId/notes/:noteId')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Edit a private note.' })
  async editNote(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Param('noteId') noteId: string,
    @Body() dto: ClientNoteDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.updateClientNote(user.workspaceId, clientId, noteId, dto.content) };
  }

  @Delete(':clientId/notes/:noteId')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a private note.' })
  async removeNote(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Param('noteId') noteId: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.deleteClientNote(user.workspaceId, clientId, noteId) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Client file vault — nutritionist view (sees client uploads + can share)
  // ────────────────────────────────────────────────────────────────────

  @Get(':clientId/files')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'All files for a client — uploaded by the client or shared by the workspace.' })
  async clientFiles(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.workspaceClientFiles(user.workspaceId, clientId) };
  }

  @Get(':clientId/files/:fileId/download')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Signed download URL for one of the client\'s files.' })
  async signClientFile(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Param('fileId') fileId: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.signWorkspaceClientFile(user.workspaceId, clientId, fileId) };
  }

  @Post(':clientId/files/upload-ticket')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Signed upload URL so the nutritionist can share a file with the client.' })
  async clientFileUploadTicket(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() dto: FileUploadTicketDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.createWorkspaceFileUploadTicket(user.workspaceId, clientId, dto.file_name) };
  }

  @Post(':clientId/files')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Record a file the nutritionist shared with the client.' })
  async shareClientFile(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() dto: ShareFileDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.addWorkspaceClientFile(user.workspaceId, clientId, dto) };
  }

  @Delete(':clientId/files/:fileId')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a client file (client upload or shared).' })
  async removeClientFile(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Param('fileId') fileId: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.deleteWorkspaceClientFile(user.workspaceId, clientId, fileId) };
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