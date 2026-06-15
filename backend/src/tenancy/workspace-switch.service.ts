import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface MembershipOption {
  workspace_id: string;
  name: string;
  role: string;
  is_active: boolean;
}

export interface ActiveWorkspace {
  workspace_id: string;
  is_impersonation: boolean;
}

/**
 * WorkspaceSwitchService — pins a user's active workspace (Module 2 Workspace
 * Switching) and powers super-admin impersonation with an audit trail.
 *
 * JwtStrategy reads user_workspace_preference and honours it when resolving the
 * caller's workspaceId, so a switch takes effect on the next request.
 */
@Injectable()
export class WorkspaceSwitchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every workspace the user is an active member of, marking the pinned one. */
  async listMemberships(userId: string): Promise<MembershipOption[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ workspace_id: string; name: string; role: string; is_active: boolean }>
    >(
      `SELECT wm.workspace_id, w.name, wm.role::text AS role,
              (pref.workspace_id = wm.workspace_id) AS is_active
         FROM public.workspace_members wm
         JOIN public.workspaces w ON w.id = wm.workspace_id
         LEFT JOIN public.user_workspace_preference pref ON pref.user_id = wm.user_id
        WHERE wm.user_id = $1::uuid AND wm.status = 'active'
        ORDER BY wm.joined_at ASC`,
      userId,
    );
    return rows.map((r) => ({ ...r, is_active: !!r.is_active }));
  }

  async getActive(userId: string): Promise<ActiveWorkspace | null> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<ActiveWorkspace>>(
      `SELECT workspace_id, is_impersonation FROM public.user_workspace_preference
        WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    return row ?? null;
  }

  /** Switch active workspace — the user must be an active member of the target. */
  async setActive(userId: string, workspaceId: string): Promise<ActiveWorkspace> {
    const [member] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.workspace_members
        WHERE user_id = $1::uuid AND workspace_id = $2::uuid AND status = 'active' LIMIT 1`,
      userId,
      workspaceId,
    );
    if (!member) throw new ForbiddenException('You are not a member of that workspace.');
    await this.upsertPreference(userId, workspaceId, false);
    return { workspace_id: workspaceId, is_impersonation: false };
  }

  /** Super-admin impersonation — pin ANY workspace and record the action. */
  async impersonate(userId: string, workspaceId: string): Promise<ActiveWorkspace> {
    const [ws] = await this.prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
      `SELECT id, name FROM public.workspaces WHERE id = $1::uuid LIMIT 1`,
      workspaceId,
    );
    if (!ws) throw new NotFoundException('Workspace not found.');
    await this.upsertPreference(userId, workspaceId, true);
    await this.audit(userId, workspaceId, 'start', ws.name);
    return { workspace_id: workspaceId, is_impersonation: true };
  }

  /** Clear the active-workspace pin (and audit if it was an impersonation). */
  async stop(userId: string): Promise<{ stopped: true }> {
    const current = await this.getActive(userId);
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.user_workspace_preference WHERE user_id = $1::uuid`,
      userId,
    );
    if (current?.is_impersonation) {
      await this.audit(userId, current.workspace_id, 'stop', null);
    }
    return { stopped: true };
  }

  // ── internals ──────────────────────────────────────────────────────

  private async upsertPreference(userId: string, workspaceId: string, impersonation: boolean): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.user_workspace_preference (user_id, workspace_id, is_impersonation, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, now())
       ON CONFLICT (user_id) DO UPDATE
         SET workspace_id = EXCLUDED.workspace_id,
             is_impersonation = EXCLUDED.is_impersonation,
             updated_at = now()`,
      userId,
      workspaceId,
      impersonation,
    );
  }

  /**
   * Write an impersonation event straight to activity_logs. We insert directly
   * (rather than via ActivityLogService) to avoid a module cycle — the
   * activity-log module already depends transitively on tenancy.
   */
  private async audit(
    userId: string,
    workspaceId: string,
    phase: 'start' | 'stop',
    workspaceName: string | null,
  ): Promise<void> {
    await this.prisma.activity_logs.create({
      data: {
        workspace_id: workspaceId,
        actor_user_id: userId,
        actor_role: 'super_admin',
        http_method: 'INTERNAL',
        route: `/admin/impersonate/${phase}`,
        entity_type: 'impersonation',
        entity_id: workspaceId,
        action: 'invoke',
        status_code: 200,
        latency_ms: 0,
        payload: { phase, workspace_name: workspaceName } as Prisma.InputJsonValue,
      },
    });
  }
}
