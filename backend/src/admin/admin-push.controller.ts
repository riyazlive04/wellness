import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { PushService } from '../clients/push.service';

class AdminPushSubscribeDto {
  @IsString() endpoint!: string;
  @IsString() p256dh!: string;
  @IsString() auth!: string;
  @IsOptional() @IsString() @MaxLength(500) user_agent?: string;
}

class AdminPushUnsubscribeDto {
  @IsString() endpoint!: string;
}

/**
 * Web-push subscription surface for platform super-admins. Mirrors the client
 * (/me/push/*) and staff (/workspaces/me/push/*) surfaces, but stores the
 * subscription against the admin's user id only (no workspace/client), so
 * NotificationsService.notifySuperAdmins() → PushService.sendToUser() reaches it.
 */
@ApiTags('Admin · Push')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/push', version: '1' })
export class AdminPushController {
  constructor(private readonly push: PushService) {}

  @Get('config')
  @ApiOperation({ summary: 'VAPID public key for super-admin browser push subscription.' })
  config() {
    return { data: this.push.getPublicConfig() };
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Register a super-admin device for platform push notifications.' })
  async subscribe(@CurrentUser() user: AuthUser, @Body() dto: AdminPushSubscribeDto) {
    return {
      data: await this.push.saveSubscription({
        userId: user.id,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.user_agent ?? null,
        clientId: null,
        workspaceId: null,
      }),
    };
  }

  @Post('unsubscribe')
  @ApiOperation({ summary: 'Remove a super-admin push subscription for the caller.' })
  async unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: AdminPushUnsubscribeDto) {
    return { data: await this.push.removeSubscription({ userId: user.id }, dto.endpoint) };
  }
}
