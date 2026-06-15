import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type { AssistantType, SuggestedAction } from './assistant.types';

export interface ConversationRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  assistant_type: string;
  title: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens: number | null;
  latency_ms: number | null;
  actions: SuggestedAction[];
  created_at: string;
}

/**
 * ConversationService — persistence for assistant sessions + messages
 * (Module 6 — Conversation History). Conversations are owned by a user and
 * tagged with the assistant_type; all reads are ownership-checked so one user
 * can never open another's history.
 */
@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, type: AssistantType, title?: string): Promise<ConversationRow> {
    const [row] = await this.prisma.$queryRawUnsafe<ConversationRow[]>(
      `INSERT INTO public.assistant_conversations (user_id, workspace_id, assistant_type, title)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       RETURNING *`,
      user.id,
      user.workspaceId,
      type,
      (title?.trim() || 'New conversation').slice(0, 120),
    );
    return row;
  }

  async list(user: AuthUser, type: AssistantType): Promise<ConversationRow[]> {
    return this.prisma.$queryRawUnsafe<ConversationRow[]>(
      `SELECT * FROM public.assistant_conversations
        WHERE user_id = $1::uuid AND assistant_type = $2
        ORDER BY COALESCE(last_message_at, created_at) DESC
        LIMIT 50`,
      user.id,
      type,
    );
  }

  /** Load a conversation the caller owns, or throw. */
  async require(user: AuthUser, conversationId: string): Promise<ConversationRow> {
    const [row] = await this.prisma.$queryRawUnsafe<ConversationRow[]>(
      `SELECT * FROM public.assistant_conversations WHERE id = $1::uuid LIMIT 1`,
      conversationId,
    );
    if (!row) throw new NotFoundException('Conversation not found.');
    if (row.user_id !== user.id) throw new ForbiddenException('Not your conversation.');
    return row;
  }

  async messages(conversationId: string, limit = 100): Promise<MessageRow[]> {
    return this.prisma.$queryRawUnsafe<MessageRow[]>(
      `SELECT id, conversation_id, role, content, tokens, latency_ms, actions, created_at
         FROM public.assistant_messages
        WHERE conversation_id = $1::uuid
        ORDER BY created_at ASC
        LIMIT $2`,
      conversationId,
      Math.min(Math.max(limit, 1), 300),
    );
  }

  async appendMessage(
    conversationId: string,
    msg: {
      role: 'user' | 'assistant' | 'system';
      content: string;
      tokens?: number | null;
      latencyMs?: number | null;
      actions?: SuggestedAction[];
    },
  ): Promise<MessageRow> {
    const [row] = await this.prisma.$queryRawUnsafe<MessageRow[]>(
      `INSERT INTO public.assistant_messages (conversation_id, role, content, tokens, latency_ms, actions)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, conversation_id, role, content, tokens, latency_ms, actions, created_at`,
      conversationId,
      msg.role,
      msg.content,
      msg.tokens ?? null,
      msg.latencyMs ?? null,
      JSON.stringify(msg.actions ?? []),
    );
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.assistant_conversations SET last_message_at = now(), updated_at = now() WHERE id = $1::uuid`,
      conversationId,
    );
    return row;
  }

  /** Auto-title a fresh conversation from the user's first message. */
  async maybeTitle(conversation: ConversationRow, firstUserMessage: string): Promise<void> {
    if (conversation.title && conversation.title !== 'New conversation') return;
    const title = firstUserMessage.trim().replace(/\s+/g, ' ').slice(0, 60) || 'New conversation';
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.assistant_conversations SET title = $1 WHERE id = $2::uuid`,
      title,
      conversation.id,
    );
  }

  async remove(user: AuthUser, conversationId: string): Promise<void> {
    await this.require(user, conversationId);
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.assistant_conversations WHERE id = $1::uuid`,
      conversationId,
    );
  }
}
