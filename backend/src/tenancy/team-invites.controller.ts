import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { TeamService } from './team.service';

/**
 * Staff invite accept flow — mirror of the client InvitesController.
 *   GET  /api/v1/team-invites/:token         — preview (public, no auth)
 *   POST /api/v1/team-invites/:token/accept  — accept as the authenticated user
 */
@ApiTags('Team Invites')
@Controller({ path: 'team-invites', version: '1' })
export class TeamInvitesController {
  constructor(private readonly team: TeamService) {}

  @Get(':token')
  @Public()
  @Throttle({ medium: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Preview a staff invite (workspace, role, inviter, expiry). No auth.' })
  async preview(@Param('token') token: string) {
    return { data: await this.team.previewInvite(token) };
  }

  @Post(':token/accept')
  @ApiBearerAuth()
  @HttpCode(200)
  @Throttle({ medium: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Accept the staff invite — grants the workspace membership + role.' })
  async accept(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    const out = await this.team.acceptInvite(token, user.id);
    return { data: { ...out, accepted: true } };
  }
}
