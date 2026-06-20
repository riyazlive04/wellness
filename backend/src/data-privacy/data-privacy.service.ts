import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Workspace-scoped tables exported under "Export workspace data". Each has a
 * `workspace_id` column. Backend-resolved only — never client-supplied — so
 * there is no SQL-injection surface. A table that fails (missing/renamed) is
 * skipped rather than failing the whole export.
 */
const EXPORT_TABLES = [
  'clients',
  'messages',
  'assessments',
  'meal_logs',
  'daily_logs',
  'meal_cards',
  'weekly_plans',
  'weekly_reports',
  'appointments',
  'follow_ups',
  'diet_preferences',
  'custom_foods',
  'invoices',
  'payments',
  'automation_rules',
  'activity_logs',
] as const;

/** Hard cap per table so a runaway workspace can't generate a multi-GB payload. */
const MAX_ROWS_PER_TABLE = 10_000;

export interface RetentionPolicy {
  client_months: number;
  messages_years: number;
  backups_days: number;
}

export interface WorkspaceExport {
  generated_at: string;
  workspace_id: string;
  workspace_name: string;
  tables: Record<string, unknown[]>;
  counts: Record<string, number>;
  truncated: string[];
}

export type DataRequestType = 'export' | 'erasure';

export interface DataRequestRow {
  id: string;
  target_email: string;
  request_channel: string;
  reason: string | null;
  status: string;
  due_by: string;
  processed_at: string | null;
  created_at: string;
}

interface CreateDataRequestInput {
  targetEmail: string;
  type: DataRequestType;
  reason?: string | null;
  requestedBy: string;
  requestedByEmail: string | null;
}

@Injectable()
export class DataPrivacyService {
  private readonly logger = new Logger(DataPrivacyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Export ─────────────────────────────────────────────────────────

  async exportWorkspace(workspaceId: string, workspaceName: string): Promise<WorkspaceExport> {
    const tables: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    const truncated: string[] = [];

    for (const table of EXPORT_TABLES) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<unknown[]>(
          `SELECT * FROM public.${table} WHERE workspace_id = $1::uuid LIMIT ${MAX_ROWS_PER_TABLE + 1}`,
          workspaceId,
        );
        if (rows.length > MAX_ROWS_PER_TABLE) {
          rows.length = MAX_ROWS_PER_TABLE;
          truncated.push(table);
        }
        tables[table] = rows;
        counts[table] = rows.length;
      } catch (err) {
        this.logger.warn(`export: ${table} read failed: ${(err as Error).message}`);
        tables[table] = [];
        counts[table] = 0;
      }
    }

    return {
      generated_at: new Date().toISOString(),
      workspace_id: workspaceId,
      workspace_name: workspaceName,
      tables,
      counts,
      truncated,
    };
  }

  // ── Retention policy ───────────────────────────────────────────────

  async getRetention(workspaceId: string): Promise<RetentionPolicy> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{ client_months: number; messages_years: number; backups_days: number }>
    >(
      `SELECT retention_client_months  AS client_months,
              retention_messages_years AS messages_years,
              retention_backups_days   AS backups_days
         FROM public.workspaces WHERE id = $1::uuid`,
      workspaceId,
    );
    return {
      client_months: row?.client_months ?? 24,
      messages_years: row?.messages_years ?? 7,
      backups_days: row?.backups_days ?? 90,
    };
  }

  async updateRetention(
    workspaceId: string,
    patch: Partial<RetentionPolicy>,
  ): Promise<RetentionPolicy> {
    const clientMonths = clampOrNull(patch.client_months, 1, 600);
    const messagesYears = clampOrNull(patch.messages_years, 1, 50);
    const backupsDays = clampOrNull(patch.backups_days, 1, 3650);
    if (clientMonths == null && messagesYears == null && backupsDays == null) {
      throw new BadRequestException('No valid retention fields to update.');
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.workspaces
          SET retention_client_months  = COALESCE($2, retention_client_months),
              retention_messages_years = COALESCE($3, retention_messages_years),
              retention_backups_days   = COALESCE($4, retention_backups_days),
              updated_at = now()
        WHERE id = $1::uuid`,
      workspaceId,
      clientMonths,
      messagesYears,
      backupsDays,
    );
    return this.getRetention(workspaceId);
  }

  // ── Client data requests (DPDP / GDPR) ─────────────────────────────

  async listDataRequests(workspaceId: string): Promise<DataRequestRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string; target_email: string; request_channel: string;
        reason: string | null; status: string;
        due_by: Date; processed_at: Date | null; created_at: Date;
      }>
    >(
      `SELECT id, target_email, request_channel, reason, status,
              due_by, processed_at, created_at
         FROM public.deletion_requests
        WHERE workspace_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 200`,
      workspaceId,
    );
    return rows.map((r) => ({
      id: r.id,
      target_email: r.target_email,
      request_channel: r.request_channel,
      reason: r.reason,
      status: r.status,
      due_by: r.due_by.toISOString(),
      processed_at: r.processed_at ? r.processed_at.toISOString() : null,
      created_at: r.created_at.toISOString(),
    }));
  }

  async createDataRequest(
    workspaceId: string,
    input: CreateDataRequestInput,
  ): Promise<DataRequestRow> {
    const email = input.targetEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('A valid client email is required.');
    }
    // Encode request type in request_channel so we need no schema change:
    //   workspace_export | workspace_erasure
    const channel = input.type === 'erasure' ? 'workspace_erasure' : 'workspace_export';

    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string; target_email: string; request_channel: string;
        reason: string | null; status: string;
        due_by: Date; processed_at: Date | null; created_at: Date;
      }>
    >(
      `INSERT INTO public.deletion_requests
         (target_email, workspace_id, requested_by, requested_by_email, request_channel, reason)
       VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6)
       RETURNING id, target_email, request_channel, reason, status, due_by, processed_at, created_at`,
      email,
      workspaceId,
      input.requestedBy,
      input.requestedByEmail,
      channel,
      input.reason ?? null,
    );
    return {
      id: row.id,
      target_email: row.target_email,
      request_channel: row.request_channel,
      reason: row.reason,
      status: row.status,
      due_by: row.due_by.toISOString(),
      processed_at: row.processed_at ? row.processed_at.toISOString() : null,
      created_at: row.created_at.toISOString(),
    };
  }
}

function clampOrNull(n: number | undefined, lo: number, hi: number): number | null {
  if (n == null || Number.isNaN(n)) return null;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
