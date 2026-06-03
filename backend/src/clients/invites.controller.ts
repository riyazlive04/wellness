import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { ClientsService } from './clients.service';

/**
 * Invite preview is @Public — a prospective client must be able to see "who
 * invited me" before they have an account. Accept requires an authenticated
 * JWT, since we use the bearer to know whose user_id to attach to the invite.
 */
@ApiTags('Invites')
@Controller({ path: 'invites', version: '1' })
export class InvitesController {
  constructor(private readonly clients: ClientsService) {}

  @Get(':token')
  @Public()
  @Throttle({ medium: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Preview an invite by token (workspace name, inviter, expiry). No auth.' })
  async preview(@Param('token') token: string) {
    return { data: await this.clients.previewInvite(token) };
  }

  @Post(':token/accept')
  @ApiBearerAuth()
  @HttpCode(200)
  @Throttle({ medium: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Accept the invite as the authenticated user; grants client role + links to workspace.' })
  async accept(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    const out = await this.clients.acceptInvite(token, user.id, user.email);
    return { data: { ...out, accepted: true } };
  }
}