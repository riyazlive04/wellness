import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AssistantContextService } from './assistant-context.service';
import { AssistantGeminiService } from './assistant-gemini.service';
import { AssistantMemoryService } from './assistant-memory.service';
import { AssistantToolsService } from './assistant-tools.service';
import { ConversationService, type MessageRow } from './conversation.service';
import { ASSISTANT_PROFILES, type AssistantType, type ChatTurn } from './assistant.types';

/**
 * AssistantService — orchestrates one chat turn (Module 6 — Conversation +
 * Context + Memory + Action framework working together):
 *   persist user message → assemble system prompt (persona + live context +
 *   remembered facts) → run the model with history → persist the assistant
 *   reply (with any suggested actions) → auto-title the conversation.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly conversations: ConversationService,
    private readonly context: AssistantContextService,
    private readonly memory: AssistantMemoryService,
    private readonly gemini: AssistantGeminiService,
    private readonly tools: AssistantToolsService,
  ) {}

  async sendMessage(
    user: AuthUser,
    type: AssistantType,
    conversationId: string,
    text: string,
  ): Promise<MessageRow> {
    const conversation = await this.conversations.require(user, conversationId);

    // Prior turns (user/assistant only) become the model history.
    const prior = await this.conversations.messages(conversationId);
    const history: ChatTurn[] = prior
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-20)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Persist the user's message before calling the model.
    await this.conversations.appendMessage(conversationId, { role: 'user', content: text });
    void this.conversations.maybeTitle(conversation, text);

    // Assemble the system prompt from persona + live context + remembered facts.
    const [ctx, memText] = await Promise.all([
      this.context.build(user, type),
      this.memory.promptText(user, type),
    ]);
    const systemPrompt = this.buildSystemPrompt(type, ctx.promptText, memText);

    const reply = await this.gemini.chat({
      assistantType: type,
      systemPrompt,
      history,
      userMessage: text,
      tools: this.tools.declarations(type),
      executeTool: (name, args) => this.tools.execute(user, type, name, args),
      workspaceId: user.workspaceId,
    });

    return this.conversations.appendMessage(conversationId, {
      role: 'assistant',
      content: reply.reply,
      tokens: reply.tokens,
      latencyMs: reply.latencyMs,
      actions: reply.actions,
    });
  }

  private buildSystemPrompt(type: AssistantType, contextText: string, memoryText: string): string {
    const profile = ASSISTANT_PROFILES[type];
    return [
      `You are ${profile.name} - ${profile.role} inside the SIRAH LIFE wellness platform.`,
      'You are an intelligent, proactive assistant - not a generic chatbot.',
      '',
      'HOW TO ANSWER:',
      '- Always answer the user’s ACTUAL question directly. Never reply with a generic description of yourself unless they explicitly ask who you are.',
      '- You have TOOLS that fetch real, live data. Whenever a question needs specifics you do not already have (a client, a list, a count, a date range, a number), CALL THE RIGHT TOOL rather than guessing. You may call several tools before answering.',
      '- Ground every answer in tool results and the LIVE CONTEXT below. Quote the real numbers/items. Never invent data - if a tool returns nothing, say so plainly and suggest the next step.',
      '- Be concise, warm, and specific. Respect the user’s role - never reveal anything outside their scope.',
      '- When the platform vocabulary differs, map it: in SIRAH LIFE, a client’s "program" is their weekly plan; "recipes" live in the workspace recipe library.',
      '',
      'LIVE CONTEXT (a starting snapshot - use tools for anything more specific):',
      contextText || '(no context available)',
      memoryText ? `\n${memoryText}` : '',
    ].join('\n');
  }
}
