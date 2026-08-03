import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { NetworkService } from './network.service';

/** Any workspace staff role may participate in the global network. */
const STAFF = ['owner', 'manager', 'nutritionist', 'assistant_nutritionist', 'receptionist', 'coach', 'support'] as const;

class CreateNetworkPostDto {
  @IsOptional() @IsString() @MaxLength(4000) content?: string;
  /** Inline image as a downscaled data URL (kept small; object storage later). */
  @IsOptional() @IsString() @MaxLength(1_500_000) imageUrl?: string;
}

class ReactDto {
  @IsString() @MinLength(1) @MaxLength(20) reaction!: string;
}

class CommentDto {
  @IsString() @MinLength(1) @MaxLength(2000) content!: string;
}

/**
 * Global Nutritionist Network — a shared professional feed across every
 * practice. Staff-only (never clients), and NOT workspace-scoped: all
 * practitioners see and post to the same feed.
 */
@ApiTags('Nutritionist Network')
@ApiBearerAuth()
@Controller({ path: 'network', version: '1' })
export class NetworkController {
  constructor(private readonly network: NetworkService) {}

  @Get('feed')
  @WorkspaceRole(...STAFF)
  @ApiOperation({ summary: 'Global nutritionist network feed. filter=following limits to people you follow.' })
  async feed(@CurrentUser() u: AuthUser, @Query('filter') filter?: string) {
    return { data: await this.network.feed(u.id, { following: filter === 'following' }) };
  }

  @Get('follows')
  @WorkspaceRole(...STAFF)
  @ApiOperation({ summary: 'Who follows me and who I follow (each with a follow-back flag).' })
  async follows(@CurrentUser() u: AuthUser) {
    return { data: await this.network.follows(u.id) };
  }

  @Post('follow/:userId')
  @WorkspaceRole(...STAFF)
  @HttpCode(200)
  @ApiOperation({ summary: 'Follow another practitioner on the network.' })
  async follow(@CurrentUser() u: AuthUser, @Param('userId') userId: string) {
    return { data: await this.network.follow(u.id, u.workspaceId, userId) };
  }

  @Delete('follow/:userId')
  @WorkspaceRole(...STAFF)
  @HttpCode(200)
  @ApiOperation({ summary: 'Unfollow a practitioner.' })
  async unfollow(@CurrentUser() u: AuthUser, @Param('userId') userId: string) {
    return { data: await this.network.unfollow(u.id, userId) };
  }

  @Post('posts')
  @WorkspaceRole(...STAFF)
  @HttpCode(201)
  @ApiOperation({ summary: 'Post to the global network as your practice.' })
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateNetworkPostDto) {
    return { data: await this.network.createPost(u.id, u.workspaceId, dto.content ?? '', dto.imageUrl) };
  }

  @Post('posts/:id/react')
  @WorkspaceRole(...STAFF)
  @HttpCode(200)
  @ApiOperation({ summary: 'Toggle a reaction (cheer/strength/love/celebrate) on a network post.' })
  async react(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReactDto) {
    return { data: await this.network.toggleReaction(u.id, id, dto.reaction) };
  }

  @Post('posts/:id/comments')
  @WorkspaceRole(...STAFF)
  @HttpCode(201)
  @ApiOperation({ summary: 'Comment on a network post.' })
  async comment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CommentDto) {
    return { data: await this.network.addComment(u.id, u.workspaceId, id, dto.content) };
  }

  @Delete('posts/:id')
  @WorkspaceRole(...STAFF)
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete your own network post (super admins may delete any).' })
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.network.deletePost(u.id, u.isSuperAdmin, id);
    return { data: { deleted: true } };
  }
}
