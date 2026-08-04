import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { NotificationsService } from './notifications.service';
import { NotificationPreferencesService } from './notification-preferences.service';

function clampLimit(raw?: string): number {
  const n = raw ? Number(raw) : 30;
  return Number.isFinite(n) ? n : 30;
}

/** Loose shape — the service whitelists/sanitises every field before storing. */
class SavePreferencesDto {
  @IsOptional() @IsObject() channels?: Record<string, unknown>;
  @IsOptional() @IsObject() events?: Record<string, unknown>;
  @IsOptional() @IsObject() quietHours?: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(-840) @Max(840) tzOffsetMinutes?: number;
}

/** Client-portal category toggles. Sanitised server-side. */
class SaveClientPreferencesDto {
  @IsOptional() @IsObject() categories?: Record<string, unknown>;
}

/** Which external channels to fire a verification test through. */
class TestSendDto {
  @IsArray() @ArrayNotEmpty()
  @IsIn(['email', 'whatsapp'], { each: true })
  channels!: Array<'email' | 'whatsapp'>;
}

/** Staff notification center — for workspace members (owner / nutritionist / …). */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the caller’s notifications (most recent first).' })
  async list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return { data: await this.notifications.listForUser(user.id, clampLimit(limit)) };
  }

  // ── Delivery preferences (channels / per-event matrix / quiet hours) ──

  @Get('preferences')
  @ApiOperation({ summary: 'The caller’s notification preferences (defaults if none saved).' })
  async getPreferences(@CurrentUser() user: AuthUser) {
    return { data: await this.preferences.getForUser(user.id) };
  }

  @Put('preferences')
  @HttpCode(200)
  @ApiOperation({ summary: 'Save the caller’s notification preferences.' })
  async savePreferences(@CurrentUser() user: AuthUser, @Body() body: SavePreferencesDto) {
    return { data: await this.preferences.saveForUser(user.id, body) };
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a test notification to the caller’s own email / WhatsApp to verify those channels.' })
  async test(@CurrentUser() user: AuthUser, @Body() body: TestSendDto) {
    return { data: await this.notifications.sendTest(user.id, user.workspaceId, body.channels) };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications for the caller.' })
  async unread(@CurrentUser() user: AuthUser) {
    return { data: { count: await this.notifications.unreadCountForUser(user.id) } };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one notification read.' })
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.notifications.markReadForUser(user.id, id);
    return { data: { ok: true } };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all the caller’s notifications read.' })
  async readAll(@CurrentUser() user: AuthUser) {
    await this.notifications.markAllForUser(user.id);
    return { data: { ok: true } };
  }
}

/** Client notification center — same feed, resolved by the caller’s client id. */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ path: 'me/notifications', version: '1' })
export class ClientNotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the calling client’s notifications.' })
  async list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return { data: await this.notifications.listForClient(user.id, clampLimit(limit)) };
  }

  // ── Category preferences (meal / water / appt / program / AI nudges) ──

  @Get('preferences')
  @ApiOperation({ summary: 'The calling client’s notification category toggles.' })
  async getPreferences(@CurrentUser() user: AuthUser) {
    return { data: { categories: await this.preferences.getClientForUser(user.id) } };
  }

  @Put('preferences')
  @HttpCode(200)
  @ApiOperation({ summary: 'Save the calling client’s notification category toggles.' })
  async savePreferences(@CurrentUser() user: AuthUser, @Body() body: SaveClientPreferencesDto) {
    return { data: { categories: await this.preferences.saveClientForUser(user.id, body) } };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count for the calling client.' })
  async unread(@CurrentUser() user: AuthUser) {
    return { data: { count: await this.notifications.unreadCountForClient(user.id) } };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one notification read.' })
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.notifications.markReadForClient(user.id, id);
    return { data: { ok: true } };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all the calling client’s notifications read.' })
  async readAll(@CurrentUser() user: AuthUser) {
    await this.notifications.markAllForClient(user.id);
    return { data: { ok: true } };
  }
}
