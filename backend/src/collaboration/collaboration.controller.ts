import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { Audit } from '../admin/audit/audit.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CollaborationService } from './collaboration.service';

const STAFF = ['owner', 'nutritionist', 'assistant_nutritionist', 'receptionist', 'coach', 'support'] as const;

class CreateChannelDto {
  @IsString() @MinLength(1) @MaxLength(40) name!: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
}
class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) content!: string;
}
class CreateNoteDto {
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
}
class UpdateNoteDto {
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) body?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
}

/**
 * Module 9 — internal team collaboration for a workspace's staff: channels,
 * team chat, shared notes, and AI-assisted comms on client threads.
 */
@ApiTags('Collaboration')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/collaboration', version: '1' })
export class CollaborationController {
  constructor(private readonly collab: CollaborationService) {}

  private ws(user: AuthUser): string {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return user.workspaceId;
  }

  // ── Channels ──
  @Get('channels')
  @WorkspaceRole(...STAFF)
  async channels(@CurrentUser() u: AuthUser) {
    return { data: await this.collab.listChannels(this.ws(u)) };
  }

  @Post('channels')
  @WorkspaceRole(...STAFF)
  @HttpCode(201)
  @Audit({ action: 'team.channel.create', resourceType: 'team_channel' })
  async createChannel(@CurrentUser() u: AuthUser, @Body() dto: CreateChannelDto) {
    return { data: await this.collab.createChannel(this.ws(u), u.id, dto.name, dto.description) };
  }

  @Delete('channels/:id')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  async deleteChannel(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.collab.deleteChannel(this.ws(u), id);
    return { data: { deleted: true } };
  }

  @Get('channels/:id/messages')
  @WorkspaceRole(...STAFF)
  async messages(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.collab.listMessages(this.ws(u), id) };
  }

  @Post('channels/:id/messages')
  @WorkspaceRole(...STAFF)
  @HttpCode(201)
  async send(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return { data: await this.collab.sendMessage(this.ws(u), u.id, id, dto.content) };
  }

  // ── Shared notes ──
  @Get('notes')
  @WorkspaceRole(...STAFF)
  async notes(@CurrentUser() u: AuthUser) {
    return { data: await this.collab.listNotes(this.ws(u)) };
  }

  @Post('notes')
  @WorkspaceRole(...STAFF)
  @HttpCode(201)
  async createNote(@CurrentUser() u: AuthUser, @Body() dto: CreateNoteDto) {
    return { data: await this.collab.createNote(this.ws(u), u.id, dto) };
  }

  @Patch('notes/:id')
  @WorkspaceRole(...STAFF)
  async updateNote(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateNoteDto) {
    return { data: await this.collab.updateNote(this.ws(u), u.id, id, dto) };
  }

  @Delete('notes/:id')
  @WorkspaceRole(...STAFF)
  @HttpCode(200)
  async deleteNote(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.collab.deleteNote(this.ws(u), id);
    return { data: { deleted: true } };
  }

  // ── AI-assisted comms (on a client thread) ──
  @Get('clients/:clientId/summary')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'AI summary of a client conversation thread.' })
  async summary(@CurrentUser() u: AuthUser, @Param('clientId') clientId: string) {
    return { data: await this.collab.summarizeClientThread(this.ws(u), clientId) };
  }

  @Get('clients/:clientId/smart-replies')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'AI-suggested reply options for a client conversation.' })
  async smartReplies(@CurrentUser() u: AuthUser, @Param('clientId') clientId: string) {
    return { data: await this.collab.smartReplies(this.ws(u), clientId) };
  }
}
