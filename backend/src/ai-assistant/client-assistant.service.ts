import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';

export interface ClientAssistantSettings {
  enabled: boolean;
  daily_limit: number;
}

export type ClientAssistantGate =
  | { allowed: true; limit: number; used: number }
  | { allowed: false; reason: 'off' | 'limit'; limit: number; used: number };

export interface ClientAssistantConversation {
  id: string;
  title: string;
  last_message_at: string | null;
  created_at: string;
  messages: Array<{ role: string; content: string; created_at: string }>;
}

/** Messages a client may send per day when the practice hasn't chosen. */
export const DEFAULT_DAILY_LIMIT = 20;

/**
 * The clients' AI assistant is the practice's call: off until the owner turns
 * it on, capped at a number of questions per client per day (every question
 * spends the practice's AI credits), and every conversation is readable by the
 * practice's nutritionists from the client's page.
 */
@Injectable()
export class ClientAssistantService {
  constructor(private readonly prisma: PrismaService) {}

  /** The practice a client belongs to. Clients carry it at sign-in; the lookup covers older sessions. */
  async workspaceOf(user: AuthUser): Promise<string | null> {
    if (user.workspaceId) return user.workspaceId;
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ workspace_id: string }>>(
      `SELECT workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`, user.id);
    return row?.workspace_id ?? null;
  }

  async settings(workspaceId: string): Promise<ClientAssistantSettings> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ enabled: boolean; daily_limit: number }>>(
      `SELECT client_assistant_enabled AS enabled, client_assistant_daily_limit AS daily_limit
         FROM public.workspaces WHERE id = $1::uuid`, workspaceId);
    return { enabled: !!row?.enabled, daily_limit: row?.daily_limit ?? DEFAULT_DAILY_LIMIT };
  }

  async update(workspaceId: string, patch: Partial<ClientAssistantSettings>): Promise<ClientAssistantSettings> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.workspaces
          SET client_assistant_enabled = COALESCE($2, client_assistant_enabled),
              client_assistant_daily_limit = COALESCE($3, client_assistant_daily_limit),
              updated_at = now()
        WHERE id = $1::uuid`,
      workspaceId, patch.enabled ?? null, patch.daily_limit ?? null);
    return this.settings(workspaceId);
  }

  /** Questions this client has asked their assistant today (India time). */
  async usedToday(userId: string): Promise<number> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n
         FROM public.assistant_messages m
         JOIN public.assistant_conversations c ON c.id = m.conversation_id
        WHERE c.user_id = $1::uuid
          AND c.assistant_type = 'wellness'
          AND m.role = 'user'
          AND m.created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`,
      userId);
    return Number(row?.n ?? 0);
  }

  /** May this client use the assistant right now? */
  async gate(user: AuthUser): Promise<ClientAssistantGate> {
    const ws = await this.workspaceOf(user);
    const s = ws ? await this.settings(ws) : { enabled: false, daily_limit: DEFAULT_DAILY_LIMIT };
    const used = await this.usedToday(user.id);
    if (!s.enabled) return { allowed: false, reason: 'off', limit: s.daily_limit, used };
    if (used >= s.daily_limit) return { allowed: false, reason: 'limit', limit: s.daily_limit, used };
    return { allowed: true, limit: s.daily_limit, used };
  }

  /** A client's assistant conversations, for their nutritionist. Newest first. */
  async conversationsForClient(workspaceId: string, clientId: string): Promise<ClientAssistantConversation[]> {
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ user_id: string | null }>>(
      `SELECT user_id FROM public.clients WHERE id = $1::uuid AND workspace_id = $2::uuid`, clientId, workspaceId);
    if (!client) throw new NotFoundException('Client not found.');
    if (!client.user_id) return [];

    const convs = await this.prisma.$queryRawUnsafe<Array<Omit<ClientAssistantConversation, 'messages'>>>(
      `SELECT id, title, last_message_at, created_at
         FROM public.assistant_conversations
        WHERE user_id = $1::uuid AND assistant_type = 'wellness'
        ORDER BY COALESCE(last_message_at, created_at) DESC
        LIMIT 30`, client.user_id);
    if (!convs.length) return [];

    const msgs = await this.prisma.$queryRawUnsafe<Array<{ conversation_id: string; role: string; content: string; created_at: string }>>(
      `SELECT conversation_id, role, content, created_at
         FROM public.assistant_messages
        WHERE conversation_id = ANY($1::uuid[]) AND role IN ('user', 'assistant')
        ORDER BY created_at ASC`, convs.map((c) => c.id));
    const byConv = new Map<string, ClientAssistantConversation['messages']>();
    for (const m of msgs) {
      const list = byConv.get(m.conversation_id) ?? [];
      list.push({ role: m.role, content: m.content, created_at: m.created_at });
      byConv.set(m.conversation_id, list);
    }
    return convs.map((c) => ({ ...c, messages: byConv.get(c.id) ?? [] }));
  }
}

/** What the client sees instead of an AI reply when the assistant can't answer. */
export function gateReply(gate: Exclude<ClientAssistantGate, { allowed: true }>): string {
  return gate.reason === 'off'
    ? "Your nutritionist hasn't switched on the AI assistant for your practice. You can message them in Chat."
    : `You've reached today's limit of ${gate.limit} questions. You can ask again tomorrow, or message your nutritionist in Chat.`;
}
