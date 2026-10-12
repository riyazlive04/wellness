import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { VideoKeysService } from './video-keys.service';

class SaveVideoKeyDto {
  @IsString() @MinLength(20) @MaxLength(400) key!: string;
}

/** The practice's video calls: NUSI's (plan hours) or its own Daily.co key. Owner-only writes; the key is never returned. */
@ApiTags('Workspace · Video key')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/video-key', version: '1' })
export class VideoKeysController {
  constructor(private readonly videoKeys: VideoKeysService) {}

  @Get()
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: "Whether the practice's video calls run on NUSI's Daily.co or its own (never the key)." })
  async get(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.videoKeys.view(user.workspaceId) };
  }

  @Put()
  @WorkspaceRole('owner')
  @ApiOperation({ summary: "Save the practice's Daily.co API key (tested with Daily.co first)." })
  async save(@CurrentUser() user: AuthUser, @Body() dto: SaveVideoKeyDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.videoKeys.save(user.workspaceId, user.id, dto.key) };
  }

  @Post('test')
  @HttpCode(200)
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Check the saved Daily.co key again.' })
  async test(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.videoKeys.retest(user.workspaceId) };
  }

  @Delete()
  @WorkspaceRole('owner')
  @ApiOperation({ summary: "Remove the practice's own Daily.co key (calls go back to NUSI's, using the plan's hours)." })
  async remove(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    await this.videoKeys.remove(user.workspaceId);
    return { data: { removed: true } };
  }
}
