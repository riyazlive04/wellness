import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { ClientsService } from './clients.service';
import { RequestJoinDto } from './dto/join.dto';

/**
 * Public face of a workspace's join link.
 *
 * Preview is @Public — a prospect must see whose practice they're joining
 * before they hand over a password. It deliberately returns only the workspace
 * name/slug: anyone holding the link can call it, so it carries no roster or
 * client data. Request needs a bearer, since the clients row hangs off the
 * caller's auth user.
 *
 * Both are throttled: the token is guessable only at 2^256, but the endpoints
 * are unauthenticated surface area and shouldn't be free to hammer.
 */
@ApiTags('Join')
@Controller({ path: 'join', version: '1' })
export class JoinController {
  constructor(private readonly clients: ClientsService) {}

  @Get(':token')
  @Public()
  @Throttle({ medium: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Preview a join link (workspace name). No auth.' })
  async preview(@Param('token') token: string) {
    return { data: await this.clients.previewJoin(token) };
  }

  @Post(':token/request')
  @ApiBearerAuth()
  @HttpCode(200)
  @Throttle({ medium: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Request to join as the authenticated user; queues for owner approval.' })
  async request(
    @Param('token') token: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestJoinDto,
  ) {
    return { data: await this.clients.requestJoin(token, user.id, user.email, dto.name) };
  }
}
