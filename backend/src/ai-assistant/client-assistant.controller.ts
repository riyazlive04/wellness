import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { ClientAssistantService } from './client-assistant.service';

class UpdateClientAssistantDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(200) daily_limit?: number;
}

/** The practice's switch for its clients' AI assistant, and the clients' chats. */
@ApiTags('Workspace · Client AI assistant')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me', version: '1' })
export class ClientAssistantController {
  constructor(private readonly clientAssistant: ClientAssistantService) {}

  @Get('client-assistant')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: "Whether clients can chat with the AI assistant, and their daily limit." })
  async get(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clientAssistant.settings(user.workspaceId) };
  }

  @Put('client-assistant')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: "Turn the clients' AI assistant on or off, or change the daily limit." })
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateClientAssistantDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clientAssistant.update(user.workspaceId, dto) };
  }

  @Get('clients/:clientId/assistant-conversations')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: "A client's conversations with their AI assistant." })
  async conversations(@CurrentUser() user: AuthUser, @Param('clientId', ParseUUIDPipe) clientId: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clientAssistant.conversationsForClient(user.workspaceId, clientId) };
  }
}
