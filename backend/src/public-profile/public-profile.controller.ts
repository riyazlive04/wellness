import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { PatchPublicProfileDto, ReplaceProfileLinksDto } from './dto/public-profile.dto';
import { PublicProfileService } from './public-profile.service';

@ApiTags('Public profile')
@Controller({ version: '1' })
export class PublicProfileController {
  constructor(private readonly profiles: PublicProfileService) {}

  /** Prospect-facing page data — no auth. */
  @Get('public/profiles/:slug')
  @Public()
  @Throttle({ medium: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Public nutritionist link-in-bio by workspace slug.' })
  async bySlug(@Param('slug') slug: string) {
    return { data: await this.profiles.getPublicBySlug(slug) };
  }

  /** Owner/manager editor payload. */
  @Get('workspaces/me/public-profile')
  @ApiBearerAuth()
  @WorkspaceRole('owner', 'manager')
  @ApiOperation({ summary: 'Get public profile settings for the caller workspace.' })
  async getMine(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) return { data: null };
    return { data: await this.profiles.getOwnerProfile(user.workspaceId) };
  }

  @Patch('workspaces/me/public-profile')
  @ApiBearerAuth()
  @WorkspaceRole('owner', 'manager')
  @ApiOperation({ summary: 'Update public profile publish settings / bio.' })
  async patchMine(@CurrentUser() user: AuthUser, @Body() dto: PatchPublicProfileDto) {
    if (!user.workspaceId) return { data: null };
    return { data: await this.profiles.patchOwnerProfile(user.workspaceId, dto) };
  }

  @Put('workspaces/me/public-profile/links')
  @ApiBearerAuth()
  @WorkspaceRole('owner', 'manager')
  @ApiOperation({ summary: 'Replace the ordered list of public profile links.' })
  async putLinks(@CurrentUser() user: AuthUser, @Body() dto: ReplaceProfileLinksDto) {
    if (!user.workspaceId) return { data: null };
    return { data: await this.profiles.replaceLinks(user.workspaceId, dto.links) };
  }
}
