import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CommunityService, REACTION_KEYS, type ReactionKey } from './community.service';

class CreatePostDto {
  @IsString() @MaxLength(5000) content!: string;
  @IsString() @MaxLength(120) authorName!: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
  @IsOptional() @IsString() cohortId?: string;
  /** Inline image as a downscaled data URL (kept small; object storage later). */
  @IsOptional() @IsString() @MaxLength(1_500_000) imageUrl?: string;
}

class ReactDto {
  @IsIn(REACTION_KEYS as unknown as string[]) reaction!: ReactionKey;
}

class CommentDto {
  @IsString() @MaxLength(2000) content!: string;
  @IsString() @MaxLength(120) authorName!: string;
}

class PinDto {
  @IsBoolean() pinned!: boolean;
}

class CreateCohortDto {
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

/**
 * Owner/workspace-facing community API. Operates on the shared community tables
 * scoped to the caller's workspace; the owner authors as a user (not a client).
 */
@ApiTags('Workspace · Community')
@ApiBearerAuth()
@RequireFeature('community')
@Controller({ path: 'workspaces/me/community', version: '1' })
export class WorkspaceCommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('feed')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Workspace community feed (pinned first), optional cohort filter.' })
  async feed(@CurrentUser() u: AuthUser, @Query('cohort') cohort?: string) {
    return { data: await this.community.feed(u.workspaceId, u.id, cohort) };
  }

  @Get('cohorts')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Community groups (cohorts) for the workspace.' })
  async cohorts(@CurrentUser() u: AuthUser) {
    return { data: await this.community.cohorts(u.workspaceId) };
  }

  @Post('cohorts')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Create a cohort to group clients for a focused challenge.' })
  async createCohort(@CurrentUser() u: AuthUser, @Body() dto: CreateCohortDto) {
    return { data: await this.community.createCohort(u.workspaceId, dto.name, dto.description) };
  }

  @Delete('cohorts/:id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Delete a cohort (its posts move back to the general feed).' })
  async deleteCohort(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.community.deleteCohort(u.workspaceId, id) };
  }

  @Get('trending')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Top hashtags in the last 7 days.' })
  async trending(@CurrentUser() u: AuthUser) {
    return { data: await this.community.trending(u.workspaceId) };
  }

  @Get('moderation')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Moderation summary: flagged count + engagement rate.' })
  async moderation(@CurrentUser() u: AuthUser) {
    return { data: await this.community.moderation(u.workspaceId) };
  }

  @Post('posts')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Create a post as the workspace owner.' })
  async createPost(@CurrentUser() u: AuthUser, @Body() dto: CreatePostDto) {
    return { data: await this.community.createPost(u.workspaceId, u.id, dto) };
  }

  @Post('posts/:id/react')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Toggle a reaction on a post.' })
  async react(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReactDto) {
    return { data: await this.community.toggleReaction(u.workspaceId, u.id, id, dto.reaction) };
  }

  @Post('posts/:id/comments')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Add a comment to a post.' })
  async comment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CommentDto) {
    return { data: await this.community.addComment(u.workspaceId, u.id, id, dto) };
  }

  @Post('posts/:id/pin')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Pin or unpin a post (owner moderation).' })
  async pin(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: PinDto) {
    return { data: await this.community.setPin(u.workspaceId, id, dto.pinned) };
  }

  @Delete('posts/:id')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Delete a post (owner moderation).' })
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.community.deletePost(u.workspaceId, id) };
  }
}