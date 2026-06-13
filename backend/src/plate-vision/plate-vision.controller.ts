import {
  Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { LogPlateDto, ReviewPlateDto } from './dto/plate-vision.dto';
import { PlateVisionService } from './plate-vision.service';
import type { PlateReviewStatus } from './plate-vision.types';

/**
 * Plate Vision — meal history + nutritionist review API.
 *
 *   Client (own data):
 *     POST   /api/v1/me/plates              — log an analyzed plate to history
 *     GET    /api/v1/me/plates              — recent plates (history)
 *     GET    /api/v1/me/plates/:id          — one plate with items + insight
 *
 *   Staff (workspace, owner/nutritionist):
 *     GET    /api/v1/workspaces/me/plates/review     — review queue
 *     GET    /api/v1/workspaces/me/plates/:id        — one plate for review
 *     PATCH  /api/v1/workspaces/me/plates/:id/review — approve / adjust / flag
 */
@ApiTags('Plate Vision')
@ApiBearerAuth()
@Controller({ path: '', version: '1' })
export class PlateVisionController {
  constructor(private readonly plates: PlateVisionService) {}

  // ── Client ─────────────────────────────────────────────────────────

  @Post('me/plates')
  @HttpCode(201)
  @ApiOperation({ summary: 'Log an analyzed plate to meal history (re-runs the engine server-side).' })
  async log(@CurrentUser() user: AuthUser, @Body() dto: LogPlateDto) {
    return { data: await this.plates.logPlate(user.id, dto) };
  }

  @Get('me/plates')
  @ApiOperation({ summary: "Caller's logged plates over the last N days (default 14)." })
  async myPlates(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const d = days ? Number(days) : 14;
    return { data: await this.plates.listMyPlates(user.id, Number.isFinite(d) ? d : 14) };
  }

  @Get('me/plates/:id')
  @ApiOperation({ summary: 'One of the caller\'s plates, with items + insight.' })
  async myPlate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.plates.getMyPlate(user.id, id) };
  }

  // ── Staff review ───────────────────────────────────────────────────

  @Get('workspaces/me/plates/review')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Plate review queue for the workspace (pending first).' })
  async reviewQueue(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return {
      data: await this.plates.listForReview(user.workspaceId, {
        status: status as PlateReviewStatus | undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      }),
    };
  }

  @Get('workspaces/me/plates/:id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'One plate (with items) for nutritionist review.' })
  async reviewDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return { data: await this.plates.getForReview(user.workspaceId, id) };
  }

  @Patch('workspaces/me/plates/:id/review')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Record a review decision: approved / adjusted / flagged.' })
  async review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewPlateDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return { data: await this.plates.reviewPlate(user.workspaceId, user.id, id, dto) };
  }
}
