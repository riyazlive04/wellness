import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AssistantGeminiService } from '../ai-assistant/assistant-gemini.service';

/**
 * CollaborationService — Module 9 internal team collaboration: workspace
 * channels for multi-party staff chat, shared notes, and AI-assisted comms
 * (conversation summaries + smart reply suggestions on client threads). All
 * existing messaging is client↔nutritionist; this is the staff-to-staff layer.
 */
@Injectable()
export class CollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: AssistantGeminiService,
  ) {}

  // ── Channels ────────────────────────────────────────────────────────
  async listChannels(workspaceId: string): Promise<ChannelRow[]> {
    let rows = await this.prisma.$queryRawUnsafe<ChannelRow[]>(
      `SELECT c.*,
              (SELECT count(*) FROM public.team_messages m WHERE m.channel_id = c.id) AS message_count
         FROM public.team_channels c WHERE c.workspace_id = $1::uuid
        ORDER BY c.is_general DESC, c.created_at`,
      workspaceId);
    if (!rows.length) {
      // Seed a default #general channel the first time a workspace opens this.
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.team_channels (workspace_id, name, description, is_general)
         VALUES ($1::uuid, 'general', 'Team-wide discussion', true)`, workspaceId);
      rows = await this.prisma.$queryRawUnsafe<ChannelRow[]>(
        `SELECT c.*, 0::bigint AS message_count FROM public.team_channels c
          WHERE c.workspace_id = $1::uuid ORDER BY c.is_general DESC, c.created_at`, workspaceId);
    }
    return rows;
  }

  async createChannel(workspaceId: string, userId: string, name: string, description?: string): Promise<ChannelRow> {
    const clean = name.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-').slice(0, 40);
    if (!clean) throw new BadRequestException('Channel name required.');
    // Prevent duplicate channels (this is how the double #general happened).
    const [existing] = await this.prisma.$queryRawUnsafe<ChannelRow[]>(
      `SELECT id FROM public.team_channels WHERE workspace_id = $1::uuid AND lower(name) = $2 LIMIT 1`,
      workspaceId, clean);
    if (existing) throw new BadRequestException(`#${clean} already exists.`);
    const [row] = await this.prisma.$queryRawUnsafe<ChannelRow[]>(
      `INSERT INTO public.team_channels (workspace_id, name, description, created_by)
       VALUES ($1::uuid, $2, $3, $4::uuid) RETURNING *`,
      workspaceId, clean, description ?? null, userId);
    return row;
  }

  async deleteChannel(workspaceId: string, id: string): Promise<void> {
    // Any channel can be deleted, but a workspace must always keep at least one.
    // (The old `is_general = false` guard silently no-opped on the seeded #general.)
    const channels = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.team_channels WHERE workspace_id = $1::uuid`, workspaceId);
    if (!channels.some((c) => c.id === id)) throw new NotFoundException('Channel not found.');
    if (channels.length <= 1) throw new BadRequestException('You must keep at least one channel.');
    // Remove the channel's messages first in case there is no ON DELETE CASCADE.
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.team_messages WHERE channel_id = $1::uuid`, id);
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.team_channels WHERE id = $1::uuid AND workspace_id = $2::uuid`, id, workspaceId);
  }

  // ── Channel messages ────────────────────────────────────────────────
  async listMessages(workspaceId: string, channelId: string, limit = 100): Promise<TeamMessageRow[]> {
    await this.requireChannel(workspaceId, channelId);
    return this.prisma.$queryRawUnsafe<TeamMessageRow[]>(
      `SELECT m.id, m.channel_id, m.sender_id, m.content, m.created_at,
              u.email AS sender_email, wm.role::text AS sender_role
         FROM public.team_messages m
         LEFT JOIN auth.users u ON u.id = m.sender_id
         LEFT JOIN public.workspace_members wm
                ON wm.user_id = m.sender_id AND wm.workspace_id = m.workspace_id
        WHERE m.channel_id = $1::uuid
        ORDER BY m.created_at ASC
        LIMIT $2`,
      channelId, Math.min(Math.max(limit, 1), 300));
  }

  async sendMessage(workspaceId: string, userId: string, channelId: string, content: string): Promise<TeamMessageRow> {
    await this.requireChannel(workspaceId, channelId);
    const text = content.trim();
    if (!text) throw new BadRequestException('Message is empty.');
    const [row] = await this.prisma.$queryRawUnsafe<TeamMessageRow[]>(
      `INSERT INTO public.team_messages (channel_id, workspace_id, sender_id, content)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
       RETURNING id, channel_id, sender_id, content, created_at`,
      channelId, workspaceId, userId, text.slice(0, 4000));
    const [withEmail] = await this.prisma.$queryRawUnsafe<TeamMessageRow[]>(
      `SELECT m.id, m.channel_id, m.sender_id, m.content, m.created_at,
              u.email AS sender_email, wm.role::text AS sender_role
         FROM public.team_messages m
         LEFT JOIN auth.users u ON u.id = m.sender_id
         LEFT JOIN public.workspace_members wm
                ON wm.user_id = m.sender_id AND wm.workspace_id = m.workspace_id
        WHERE m.id = $1::uuid`, row.id);
    return withEmail ?? row;
  }

  // ── Shared notes ────────────────────────────────────────────────────
  async listNotes(workspaceId: string): Promise<NoteRow[]> {
    return this.prisma.$queryRawUnsafe<NoteRow[]>(
      `SELECT n.*, u.email AS author_email FROM public.team_notes n
         LEFT JOIN auth.users u ON u.id = n.created_by
        WHERE n.workspace_id = $1::uuid
        ORDER BY n.pinned DESC, n.updated_at DESC LIMIT 200`,
      workspaceId);
  }

  async createNote(workspaceId: string, userId: string, dto: { title?: string; body: string }): Promise<NoteRow> {
    const [row] = await this.prisma.$queryRawUnsafe<NoteRow[]>(
      `INSERT INTO public.team_notes (workspace_id, title, body, created_by, updated_by)
       VALUES ($1::uuid, $2, $3, $4::uuid, $4::uuid) RETURNING *`,
      workspaceId, dto.title ?? null, dto.body.trim(), userId);
    return row;
  }

  async updateNote(workspaceId: string, userId: string, id: string, dto: { title?: string; body?: string; pinned?: boolean }): Promise<NoteRow> {
    const [row] = await this.prisma.$queryRawUnsafe<NoteRow[]>(
      `UPDATE public.team_notes SET
         title = COALESCE($4, title), body = COALESCE($5, body), pinned = COALESCE($6, pinned),
         updated_by = $3::uuid, updated_at = now()
       WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING *`,
      id, workspaceId, userId, dto.title ?? null, dto.body ?? null, dto.pinned ?? null);
    if (!row) throw new NotFoundException('Note not found.');
    return row;
  }

  async deleteNote(workspaceId: string, id: string): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.team_notes WHERE id = $1::uuid AND workspace_id = $2::uuid`, id, workspaceId);
  }

  // ── AI-assisted comms (on client threads) ───────────────────────────
  async summarizeClientThread(workspaceId: string, clientId: string): Promise<{ summary: string }> {
    const msgs = await this.loadClientThread(workspaceId, clientId);
    if (!msgs.length) return { summary: 'No conversation yet to summarize.' };
    const transcript = msgs.map((m) => `${m.sender_type === 'admin' ? 'Nutritionist' : 'Client'}: ${m.content}`).join('\n');
    const summary = await this.gemini.summarize({
      assistantType: 'clinical',
      systemPrompt:
        'You are a clinical assistant. Summarize this nutritionist↔client conversation in 3-4 short bullet points: key topics, the client’s main concerns, and any open follow-ups the nutritionist should action. Plain text.',
      prompt: transcript.slice(0, 8000),
      workspaceId,
      fallback: 'Recent conversation covers the client’s questions and the nutritionist’s guidance. Review the thread for open follow-ups.',
    });
    return { summary };
  }

  async smartReplies(workspaceId: string, clientId: string): Promise<{ replies: string[] }> {
    const msgs = await this.loadClientThread(workspaceId, clientId);
    if (!msgs.length) return { replies: [] };
    const transcript = msgs.slice(-12).map((m) => `${m.sender_type === 'admin' ? 'Nutritionist' : 'Client'}: ${m.content}`).join('\n');
    const raw = await this.gemini.summarize({
      assistantType: 'clinical',
      systemPrompt:
        'You help a nutritionist reply to their client. Based on the conversation, suggest exactly 3 short, warm, professional reply options the nutritionist could send next. Respond ONLY with a JSON array of 3 strings, no markdown.',
      prompt: transcript.slice(0, 6000),
      workspaceId,
      fallback: '["Thanks for sharing - let’s tackle that together.","Great progress! Keep it up and log your meals today.","Got it. I’ll review and send an update shortly."]',
    });
    return { replies: parseReplies(raw) };
  }

  // ── internals ───────────────────────────────────────────────────────
  private async requireChannel(workspaceId: string, channelId: string): Promise<void> {
    const [c] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.team_channels WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`, channelId, workspaceId);
    if (!c) throw new NotFoundException('Channel not found.');
  }

  private async loadClientThread(workspaceId: string, clientId: string): Promise<Array<{ sender_type: string; content: string }>> {
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`, clientId, workspaceId);
    if (!client) throw new ForbiddenException('Client not in your workspace.');
    return this.prisma.$queryRawUnsafe<Array<{ sender_type: string; content: string }>>(
      `SELECT sender_type, content FROM public.messages
        WHERE client_id = $1::uuid ORDER BY created_at ASC LIMIT 60`, clientId);
  }
}

export interface ChannelRow {
  id: string; workspace_id: string; name: string; description: string | null;
  is_general: boolean; created_by: string | null; created_at: string; message_count?: number;
}
export interface TeamMessageRow {
  id: string; channel_id: string; sender_id: string | null; content: string; created_at: string;
  sender_email?: string | null; sender_role?: string | null;
}
export interface NoteRow {
  id: string; workspace_id: string; title: string | null; body: string; pinned: boolean;
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string; author_email?: string | null;
}

function parseReplies(raw: string): string[] {
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    const arr = JSON.parse(m ? m[0] : raw) as unknown;
    if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 3);
  } catch { /* fall through */ }
  return raw.split('\n').map((l) => l.replace(/^[-*\d."\s]+/, '').trim()).filter(Boolean).slice(0, 3);
}
