/**
 * Server-driven UI — the device read endpoint.
 *
 * Two routes, both called on every cold start and on every return from
 * background, so both are on the hot path and both opt out of the global GET
 * cache. That opt-out is not a micro-optimisation — see below.
 */
import { Controller, Get, Header, HttpCode, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { NoCache } from '../common/cache/no-cache.decorator';
import { SduiService } from './sdui.service';
import type { UiBundle } from './sdui.types';

@ApiTags('Me · App layout')
@ApiBearerAuth()
@Controller({ path: 'me/ui', version: '1' })
export class MeUiController {
  constructor(private readonly sdui: SduiService) {}

  /**
   * Every server-driven screen for the caller's workspace, in one payload.
   *
   * `@NoCache()` is required for correctness, not speed. HttpCacheInterceptor
   * replays a cached payload WITHOUT invoking this handler, so the ETag header
   * below would never be set on a cache hit — and a conditional request cannot
   * work against a response that carries no validator. The endpoint would
   * silently re-send the whole bundle on every poll.
   *
   * The 304 itself is left to Express: `res.send()` checks `req.fresh` against
   * the ETag we set here and strips the body. Doing it by hand does NOT work in
   * this app — TransformInterceptor maps the handler's return value into the
   * `{ data, meta }` envelope, so returning `undefined` for a 304 just produces
   * a 200 with an empty envelope.
   */
  @Get()
  @NoCache()
  @Header('Cache-Control', 'private, max-age=60, must-revalidate')
  @ApiOperation({
    summary:
      'Server-driven layouts for home, more, tabs and onboarding. Send If-None-Match to get a 304.',
  })
  async bundle(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: UiBundle }> {
    const bundle = await this.sdui.bundleForUser(user.id);
    res.setHeader('ETag', `"${bundle.etag}"`);
    return { data: bundle };
  }

  /**
   * Cheap liveness probe for the layout cache.
   *
   * The app polls this on an interval and on every foreground instead of the
   * full bundle. It is a few bytes on the wire AND cheap to produce — see
   * SduiService.revisionForUser.
   *
   * `@NoCache()` here too, and for a subtler reason: the two endpoints must
   * never disagree. If this one could serve a 15-second-old hash while the
   * bundle endpoint served a fresh one, then in the window right after a
   * publish a client that had just adopted the new layout would compare its
   * new hash against a stale old one and show "update available" again.
   */
  @Get('revision')
  @NoCache()
  @HttpCode(200)
  @Header('Cache-Control', 'private, max-age=30, must-revalidate')
  @ApiOperation({ summary: 'Current layout hash, for deciding whether to refetch the bundle.' })
  async revision(@CurrentUser() user: AuthUser): Promise<{ data: { etag: string; version: number } }> {
    // Deliberately NOT bundleForUser(): this is polled by every client, so it
    // reads the hash from two indexed queries rather than building the payload.
    return { data: await this.sdui.revisionForUser(user.id) };
  }
}
