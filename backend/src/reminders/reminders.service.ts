import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { cleanReminderSettings, type ReminderSettingsInput } from './reminder-settings';
import type { ReminderSequence, ReminderSettings } from './reminders.types';

interface SequenceInput {
  name: string;
  description?: string | null;
  settings: ReminderSettingsInput;
}

/**
 * Meal-time, water and routine reminders. The nutritionist sets them per client
 * (by hand, or by applying one of the practice's sequences); the client can
 * adjust times on their phone. Either way they land in clients.reminder_settings
 * and the client app schedules them on the phone the next time it opens.
 */
@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Sequences
  // ─────────────────────────────────────────────────────────────────

  async listSequences(workspaceId: string): Promise<ReminderSequence[]> {
    const rows = await this.prisma.$queryRawUnsafe<Array<ReminderSequence & { client_count: bigint }>>(
      `SELECT s.id, s.name, s.description, s.settings, s.updated_at,
              (SELECT count(*) FROM public.clients c
                WHERE c.workspace_id = s.workspace_id
                  AND c.reminder_settings->>'sequence_id' = s.id::text) AS client_count
         FROM public.reminder_sequences s
        WHERE s.workspace_id = $1::uuid
        ORDER BY lower(s.name)`,
      workspaceId,
    );
    return rows.map((r) => ({ ...r, client_count: Number(r.client_count) }));
  }

  async createSequence(workspaceId: string, userId: string, input: SequenceInput): Promise<ReminderSequence> {
    const settings = cleanReminderSettings(input.settings);
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO public.reminder_sequences (workspace_id, name, description, settings, created_by)
       VALUES ($1::uuid, $2, $3, $4::jsonb, $5::uuid) RETURNING id`,
      workspaceId,
      input.name.trim().slice(0, 80),
      input.description?.trim().slice(0, 300) || null,
      JSON.stringify(settings),
      userId,
    );
    return this.sequence(workspaceId, row.id);
  }

  /** Save a sequence; with `reapply`, clients already on it get the new version too. */
  async updateSequence(
    workspaceId: string,
    id: string,
    input: SequenceInput,
    reapply: boolean,
  ): Promise<{ sequence: ReminderSequence; updated_clients: number }> {
    const settings = cleanReminderSettings(input.settings);
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.reminder_sequences
          SET name = $3, description = $4, settings = $5::jsonb, updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid
        RETURNING id`,
      id,
      workspaceId,
      input.name.trim().slice(0, 80),
      input.description?.trim().slice(0, 300) || null,
      JSON.stringify(settings),
    );
    if (!rows.length) throw new NotFoundException('Reminder sequence not found');

    let updated = 0;
    if (reapply) {
      const ids = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM public.clients
          WHERE workspace_id = $1::uuid AND reminder_settings->>'sequence_id' = $2`,
        workspaceId,
        id,
      );
      updated = await this.applySequence(workspaceId, id, ids.map((r) => r.id));
    }
    return { sequence: await this.sequence(workspaceId, id), updated_clients: updated };
  }

  /** Clients keep the reminders they have; they're just no longer linked to it. */
  async deleteSequence(workspaceId: string, id: string): Promise<{ deleted: true }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.reminder_sequences WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING id`,
      id,
      workspaceId,
    );
    if (!rows.length) throw new NotFoundException('Reminder sequence not found');
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.clients
          SET reminder_settings = reminder_settings || '{"sequence_id": null}'::jsonb
        WHERE workspace_id = $1::uuid AND reminder_settings->>'sequence_id' = $2`,
      workspaceId,
      id,
    );
    return { deleted: true };
  }

  /** Give these clients the sequence's reminders. Returns how many were updated. */
  async applySequence(workspaceId: string, id: string, clientIds: string[]): Promise<number> {
    const seq = await this.sequence(workspaceId, id);
    const settings: ReminderSettings = {
      ...cleanReminderSettings(seq.settings),
      sequence_id: seq.id,
      sequence_name: seq.name,
      updated_by: 'nutritionist',
      updated_at: new Date().toISOString(),
    };
    const updated = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.clients
          SET reminder_settings = $3::jsonb, updated_at = now()
        WHERE workspace_id = $1::uuid AND id = ANY($2::uuid[])
        RETURNING id`,
      workspaceId,
      clientIds,
      JSON.stringify(settings),
    );
    for (const c of updated) this.tellClient(workspaceId, c.id);
    return updated.length;
  }

  private async sequence(workspaceId: string, id: string): Promise<ReminderSequence> {
    const seq = (await this.listSequences(workspaceId)).find((s) => s.id === id);
    if (!seq) throw new NotFoundException('Reminder sequence not found');
    return seq;
  }

  // ─────────────────────────────────────────────────────────────────
  // One client, set by the nutritionist
  // ─────────────────────────────────────────────────────────────────

  async clientSettings(workspaceId: string, clientId: string): Promise<ReminderSettings | null> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ reminder_settings: ReminderSettings | null }>>(
      `SELECT reminder_settings FROM public.clients WHERE id = $1::uuid AND workspace_id = $2::uuid`,
      clientId,
      workspaceId,
    );
    if (!row) throw new NotFoundException('Client not found');
    return row.reminder_settings;
  }

  /** Set by hand: no longer tied to a sequence, so re-applying one won't overwrite it. */
  async setClientSettings(workspaceId: string, clientId: string, input: ReminderSettingsInput): Promise<ReminderSettings> {
    const settings: ReminderSettings = {
      ...cleanReminderSettings(input),
      sequence_id: null,
      sequence_name: null,
      updated_by: 'nutritionist',
      updated_at: new Date().toISOString(),
    };
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.clients SET reminder_settings = $3::jsonb, updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING id`,
      clientId,
      workspaceId,
      JSON.stringify(settings),
    );
    if (!rows.length) throw new NotFoundException('Client not found');
    this.tellClient(workspaceId, clientId);
    return settings;
  }

  private tellClient(workspaceId: string, clientId: string): void {
    void this.notifications.notifyClient(workspaceId, clientId, {
      type: 'reminders:updated',
      title: '⏰ Your reminders are ready',
      body: 'Your nutritionist set your meal, water and daily routine reminders. Open NUSI to get them on this phone.',
      url: '/portal',
      tag: 'reminders',
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // The client, from their app
  // ─────────────────────────────────────────────────────────────────

  async mySettings(userId: string): Promise<ReminderSettings | null> {
    return (await this.myRow(userId)).reminder_settings;
  }

  private async myRow(userId: string): Promise<{ id: string; reminder_settings: ReminderSettings | null }> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string; reminder_settings: ReminderSettings | null }>>(
      `SELECT id, reminder_settings FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!row) throw new NotFoundException('No client profile linked to this user');
    return row;
  }

  /**
   * The client can change times and switch groups on or off. The nutritionist's
   * own reminders and the sequence link always come from the stored settings.
   */
  async setMySettings(userId: string, input: ReminderSettingsInput): Promise<ReminderSettings> {
    const me = await this.myRow(userId);
    const current = me.reminder_settings;
    const settings: ReminderSettings = {
      ...cleanReminderSettings({ ...input, custom: current?.custom ?? [] }),
      sequence_id: current?.sequence_id ?? null,
      sequence_name: current?.sequence_name ?? null,
      updated_by: 'client',
      updated_at: new Date().toISOString(),
    };
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.clients SET reminder_settings = $2::jsonb, updated_at = now() WHERE id = $1::uuid`,
      me.id,
      JSON.stringify(settings),
    );
    return settings;
  }
}
