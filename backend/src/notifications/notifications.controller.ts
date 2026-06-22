import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { NotificationsService } from './notifications.service';

function clampLimit(raw?: string): number {
  const n = raw ? Number(raw) : 30;
  return Number.isFinite(n) ? n : 30;
}

/** Staff notification center — for workspace members (owner / nutritionist / …). */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List the caller’s notifications (most recent first).' })
  async list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return { data: await this.notifications.listForUser(user.id, clampLimit(limit)) };
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
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List the calling client’s notifications.' })
  async list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return { data: await this.notifications.listForClient(user.id, clampLimit(limit)) };
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
