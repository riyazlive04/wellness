import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { AiKeysService, type AiProvider } from './ai-keys.service';

class SaveAiKeyDto {
  @IsIn(['gemini', 'openai']) provider!: AiProvider;
  @IsString() @MinLength(20) @MaxLength(400) key!: string;
}

/** The practice's AI: NUSI's from the plan, or its own key. Owner-only writes; the key is never returned. */
@ApiTags('Workspace · AI key')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/ai-key', version: '1' })
export class AiKeysController {
  constructor(private readonly aiKeys: AiKeysService) {}

  @Get()
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: "Which AI the practice uses (NUSI's included AI or its own key; never the key)." })
  async get(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.aiKeys.view(user.workspaceId) };
  }

  @Put()
  @WorkspaceRole('owner')
  @ApiOperation({ summary: "Save the practice's Gemini or OpenAI key (tested with the provider first)." })
  async save(@CurrentUser() user: AuthUser, @Body() dto: SaveAiKeyDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.aiKeys.save(user.workspaceId, user.id, dto.provider, dto.key) };
  }

  @Post('test')
  @HttpCode(200)
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Check the saved key again.' })
  async test(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.aiKeys.retest(user.workspaceId) };
  }

  @Delete()
  @WorkspaceRole('owner')
  @ApiOperation({ summary: "Remove the practice's own AI key (AI goes back to NUSI's, if the plan includes it)." })
  async remove(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    await this.aiKeys.remove(user.workspaceId);
    return { data: { removed: true } };
  }
}
