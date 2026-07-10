import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { WorkspaceMemberRole } from '../auth/types/auth-user.type';
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_PERMISSIONS,
  computeEffectivePermissions,
  type OverrideEffect,
  type Permission,
} from '../auth/permissions';

export interface MemberPermissions {
  member_id: string;
  user_id: string;
  role: string;
  /** Permissions the role grants by default. */
  role_defaults: string[];
  /** Per-user grant/deny refinements. */
  overrides: Array<{ permission: string; effect: OverrideEffect }>;
  /** Net result after applying overrides — what the member can actually do. */
  effective: string[];
}

/**
 * PermissionsService — reads the catalog + resolves/edits per-member permission
 * overrides (Module 2 Permission Management).
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Static catalog for the admin UI: all permissions, grouped, + role defaults. */
  getCatalog() {
    return {
      permissions: [...PERMISSIONS],
      groups: PERMISSION_GROUPS,
      roleDefaults: ROLE_PERMISSIONS,
    };
  }

  async getMemberPermissions(workspaceId: string, memberId: string): Promise<MemberPermissions> {
    const member = await this.resolveMember(workspaceId, memberId);
    const overrides = await this.prisma.$queryRawUnsafe<Array<{ permission: string; effect: OverrideEffect }>>(
      `SELECT permission, effect FROM public.workspace_permission_overrides
        WHERE workspace_id = $1::uuid AND user_id = $2::uuid
        ORDER BY permission`,
      workspaceId,
      member.user_id,
    );
    const role = member.role as WorkspaceMemberRole;
    return {
      member_id: memberId,
      user_id: member.user_id,
      role,
      role_defaults: ROLE_PERMISSIONS[role] ?? [],
      overrides,
      effective: computeEffectivePermissions(role, overrides),
    };
  }

  /**
   * Replace a member's overrides with the provided set. Each entry must be a
   * known permission with effect grant|deny. Sending an empty list clears all
   * overrides (member reverts to pure role defaults).
   */
  async setMemberOverrides(
    workspaceId: string,
    memberId: string,
    setBy: string,
    overrides: Array<{ permission: string; effect: OverrideEffect }>,
  ): Promise<MemberPermissions> {
    const member = await this.resolveMember(workspaceId, memberId);

    for (const o of overrides) {
      if (!(PERMISSIONS as readonly string[]).includes(o.permission as Permission)) {
        throw new BadRequestException(`Unknown permission "${o.permission}".`);
      }
      if (o.effect !== 'grant' && o.effect !== 'deny') {
        throw new BadRequestException(`Effect must be grant|deny (got "${o.effect}").`);
      }
    }
    // Owner is all-powerful by definition — overrides would be meaningless.
    if (member.role === 'owner') {
      throw new BadRequestException('Owners hold every permission; overrides do not apply.');
    }

    // NOTE: no interactive `$transaction(async tx => …)` here on purpose — those
    // don't work over Supabase's transaction-mode connection pooler (PgBouncer),
    // which reassigns backends per statement and makes Prisma lose the txn
    // ("Transaction not found"). Two set-based statements are pooler-safe:
    // clear the member's overrides, then insert the new set in one INSERT.
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM public.workspace_permission_overrides
        WHERE workspace_id = $1::uuid AND user_id = $2::uuid`,
      workspaceId,
      member.user_id,
    );
    if (overrides.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.workspace_permission_overrides
           (workspace_id, user_id, permission, effect, set_by)
         SELECT $1::uuid, $2::uuid, x.permission, x.effect, $3::uuid
           FROM jsonb_to_recordset($4::jsonb) AS x(permission text, effect text)`,
        workspaceId,
        member.user_id,
        setBy,
        JSON.stringify(overrides),
      );
    }

    return this.getMemberPermissions(workspaceId, memberId);
  }

  private async resolveMember(workspaceId: string, memberId: string): Promise<{ user_id: string; role: string }> {
    const [member] = await this.prisma.$queryRawUnsafe<Array<{ user_id: string; role: string }>>(
      `SELECT user_id, role::text AS role FROM public.workspace_members
        WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      memberId,
      workspaceId,
    );
    if (!member) throw new NotFoundException('Member not found in this workspace.');
    return member;
  }
}
