import { Body, Controller, Delete, Get, HttpCode, Param, Put, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { ConnectionsService } from './connections.service';

class SaveEmailDto {
  @IsString() @MinLength(8) @MaxLength(200) apiKey!: string;
  @IsEmail() fromEmail!: string;
  @IsOptional() @IsString() @MaxLength(80) fromName?: string;
}

/**
 * Per-workspace notification channel connections. Owner-only — each practice
 * manages its OWN email sender (and, later, WhatsApp number). Secrets are
 * encrypted at rest and never returned by GET.
 */
@ApiTags('Workspace · Connections')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/connections', version: '1' })
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  @WorkspaceRole('owner')
  @ApiOperation({ summary: "Status of the workspace's channel connections (no secrets)." })
  async list(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) return { data: [] };
    return { data: await this.connections.list(user.workspaceId) };
  }

  @Put('email')
  @HttpCode(200)
  @WorkspaceRole('owner')
  @ApiOperation({ summary: "Connect/update the workspace's own Resend email sender; verifies by test send." })
  async saveEmail(@CurrentUser() user: AuthUser, @Body() dto: SaveEmailDto) {
    if (!user.workspaceId) return { data: null };
    return { data: await this.connections.saveEmail(user.workspaceId, dto, user.email ?? null) };
  }

  @Post('email/test')
  @HttpCode(200)
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Re-send a verification email using the saved connection.' })
  async testEmail(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId || !user.email) return { data: { ok: false, error: 'No workspace or email.' } };
    return { data: await this.connections.testEmail(user.workspaceId, user.email) };
  }

  @Delete(':channel')
  @HttpCode(200)
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Disconnect a channel (email | whatsapp).' })
  async disconnect(@CurrentUser() user: AuthUser, @Param('channel') channel: string) {
    if (!user.workspaceId) return { data: { ok: true } };
    if (channel !== 'email' && channel !== 'whatsapp') return { data: { ok: false } };
    await this.connections.disconnect(user.workspaceId, channel);
    return { data: { ok: true } };
  }
}
