import {
  Body, Controller, Delete, Get, HttpCode, Param, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { Audit } from '../admin/audit/audit.decorator';
import { PrismaService } from '../database/prisma.service';

import { AssistantService } from './assistant.service';
import { AssistantBriefService } from './assistant-brief.service';
import { AssistantMemoryService } from './assistant-memory.service';
import { AssistantActionService } from './assistant-action.service';
import { ConversationService } from './conversation.service';
import { AssistantGeminiService } from './assistant-gemini.service';
import { ASSISTANT_PROFILES, resolveAssistantType } from './assistant.types';

class CreateConversationDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
}
class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) text!: string;
}
class RememberDto {
  @IsString() @MinLength(1) @MaxLength(120) key!: string;
  @IsString() @MinLength(1) @MaxLength(2000) value!: string;
}
class ExecuteActionDto {
  @IsOptional() @IsObject() params?: Record<string, unknown>;
}

/**
 * Module 6 — the single assistant API. The assistant a caller gets (executive /
 * clinical / wellness) is resolved server-side from their identity, so every
 * endpoint is automatically role-scoped without separate controllers.
 */
@ApiTags('AI Assistant')
@ApiBearerAuth()
@Controller({ path: 'assistants/me', version: '1' })
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly briefs: AssistantBriefService,
    private readonly memory: AssistantMemoryService,
    private readonly actions: AssistantActionService,
    private readonly conversations: ConversationService,
    private readonly gemini: AssistantGeminiService,
    private readonly prisma: PrismaService,
  ) {}

  /** Who is my assistant? Profile + capabilities + available actions. */
  @Get()
  @ApiOperation({ summary: 'Resolve the caller’s assistant: identity, capabilities, actions.' })
  me(@CurrentUser() user: AuthUser) {
    const type = resolveAssistantType(user);
    return {
      data: {
        ...ASSISTANT_PROFILES[type],
        actions: this.actions.catalog(type),
        aiConfigured: this.gemini.isConfigured,
      },
    };
  }

  @Get('brief')
  @ApiOperation({ summary: 'Role-specific morning brief.' })
  async brief(@CurrentUser() user: AuthUser) {
    const type = resolveAssistantType(user);
    return { data: await this.briefs.brief(user, type) };
  }

  // ── Conversations ──────────────────────────────────────────────────

  @Get('conversations')
  async listConversations(@CurrentUser() user: AuthUser) {
    const type = resolveAssistantType(user);
    return { data: await this.conversations.list(user, type) };
  }

  @Post('conversations')
  @HttpCode(201)
  @Audit({ action: 'assistant.conversation.create', resourceType: 'assistant_conversation' })
  async createConversation(@CurrentUser() user: AuthUser, @Body() dto: CreateConversationDto) {
    const type = resolveAssistantType(user);
    return { data: await this.conversations.create(user, type, dto.title) };
  }

  @Get('conversations/:id')
  async getConversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const conversation = await this.conversations.require(user, id);
    const messages = await this.conversations.messages(id);
    return { data: { conversation, messages } };
  }

  @Delete('conversations/:id')
  @HttpCode(200)
  @Audit({ action: 'assistant.conversation.delete', resourceType: 'assistant_conversation', resourceIdParam: 'id' })
  async deleteConversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.conversations.remove(user, id);
    return { data: { deleted: true } };
  }

  @Post('conversations/:id/messages')
  @HttpCode(201)
  @ApiOperation({ summary: 'Send a message and get the assistant’s reply.' })
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const type = resolveAssistantType(user);
    return { data: await this.assistant.sendMessage(user, type, id, dto.text) };
  }

  // ── Memory ─────────────────────────────────────────────────────────

  @Get('memory')
  async listMemory(@CurrentUser() user: AuthUser) {
    const type = resolveAssistantType(user);
    return { data: await this.memory.list(user, type) };
  }

  @Post('memory')
  @HttpCode(201)
  async remember(@CurrentUser() user: AuthUser, @Body() dto: RememberDto) {
    const type = resolveAssistantType(user);
    return { data: await this.memory.remember(user, type, dto.key, dto.value) };
  }

  @Delete('memory/:id')
  @HttpCode(200)
  async forget(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const type = resolveAssistantType(user);
    await this.memory.forget(user, type, id);
    return { data: { deleted: true } };
  }

  // ── Actions ────────────────────────────────────────────────────────

  @Post('actions/:type')
  @HttpCode(200)
  @Audit({ action: 'assistant.action.execute', resourceType: 'assistant_action', resourceIdParam: 'type' })
  @ApiOperation({ summary: 'Execute a suggested action (validate → permission → execute → log).' })
  async executeAction(
    @CurrentUser() user: AuthUser,
    @Param('type') actionType: string,
    @Body() dto: ExecuteActionDto,
  ) {
    const type = resolveAssistantType(user);
    return { data: await this.actions.execute(user, type, actionType, dto.params ?? {}, null) };
  }

  // ── Analytics ──────────────────────────────────────────────────────

  @Get('analytics')
  @ApiOperation({ summary: 'Interaction metrics for the caller’s assistant.' })
  async analytics(@CurrentUser() user: AuthUser) {
    const type = resolveAssistantType(user);
    const [row] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
      `SELECT
         (SELECT count(*) FROM public.assistant_conversations WHERE user_id = $1::uuid AND assistant_type = $2) AS conversations,
         (SELECT count(*) FROM public.assistant_messages m
            JOIN public.assistant_conversations c ON c.id = m.conversation_id
           WHERE c.user_id = $1::uuid AND c.assistant_type = $2) AS messages,
         (SELECT count(*) FROM public.assistant_actions WHERE user_id = $1::uuid AND assistant_type = $2 AND status = 'executed') AS actions_run`,
      user.id,
      type,
    );
    return {
      data: {
        assistant_type: type,
        conversations: Number(row?.conversations ?? 0n),
        messages: Number(row?.messages ?? 0n),
        actions_run: Number(row?.actions_run ?? 0n),
      },
    };
  }
}
