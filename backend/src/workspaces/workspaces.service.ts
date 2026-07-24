import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthCacheService } from '../auth/auth-cache.service';
import { VerificationService } from '../verification/verification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../database/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string;
  plan: string;
  trial_ends_at: Date;
  status: 'active' | 'suspended' | 'deleted';
  display_name: string | null;
  legal_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  brand_accent: string | null;
  tagline: string | null;
  dashboard_quote: string | null;
  white_label: boolean;
  contact_email: string | null;
  contact_phone: string | null;
  timezone: string | null;
  locale: string | null;
  city: string | null;
  country_code: string | null;
  gstin: string | null;
  pan: string | null;
  pdf_contact_line: string | null;
  pdf_footer_note: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authCache: AuthCacheService,
    private readonly verification: VerificationService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Create a new workspace AND make the caller its owner. Two writes in one
   * transaction:
   *   1. INSERT into workspaces  (owner_id = userId)
   *   2. INSERT into workspace_members (workspace_id, user_id, role='owner')
   *
   * If the user already owns a workspace, returns it instead of 409. Most
   * onboarding flows are idempotent — re-running shouldn't duplicate.
   */
  async createForOwner(
    userId: string,
    dto: CreateWorkspaceDto,
  ): Promise<WorkspaceSummary> {
    // Idempotency: if this user already owns an active workspace, return it.
    const existing = await this.prisma.workspaces.findFirst({
      where: { owner_id: userId, status: { not: 'deleted' } },
      orderBy: { created_at: 'asc' },
    });
    if (existing) {
      this.logger.log(`createForOwner: user ${userId} already owns ${existing.id} - returning`);
      // Drop any cached 'unaffiliated' identity so the next /auth/me/scope call
      // re-resolves to tier 'workspace' instead of bouncing back to /onboarding.
      await this.authCache.invalidate(userId);
      return existing as unknown as WorkspaceSummary;
    }

    const slug = (dto.slug ?? this.deriveSlug(dto.name)).slice(0, 64);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const ws = await tx.workspaces.create({
          data: {
            name:          dto.name,
            slug,
            owner_id:      userId,
            plan:          dto.plan ?? 'trial',
            display_name:  dto.display_name ?? null,
            contact_email: dto.contact_email ?? null,
            contact_phone: dto.contact_phone ?? null,
            city:          dto.city ?? null,
            country_code:  dto.country_code ?? null,
            gstin:         dto.gstin ?? null,
            pan:           dto.pan ?? null,
          },
        });
        await tx.workspace_members.create({
          data: {
            workspace_id: ws.id,
            user_id:      userId,
            role:         'owner',
            status:       'active',
            joined_at:    new Date(),
          },
        });
        return ws;
      });
      this.logger.log(`createForOwner: created workspace ${created.id} for ${userId}`);
      // Surface the new workspace in the super-admin verification queue right
      // away as "Awaiting submission" (placeholder row, no credentials yet).
      // Non-fatal: a failure here must not roll back the workspace.
      try {
        await this.verification.initForWorkspace(created.id);
      } catch (e) {
        this.logger.warn(`initForWorkspace failed for ${created.id}: ${(e as Error).message}`);
      }
      // Alert platform super-admins that a new workspace just signed up.
      void this.notifications.notifySuperAdmins(created.id, {
        type: 'workspace:signup',
        title: '🏢 New workspace signup',
        body: `${created.name} just created a workspace on SIRAH LIFE.`,
        url: `/admin/workspaces/${created.id}`,
        tag: `workspace-signup-${created.id}`,
      });
      // The caller just became a workspace owner — invalidate the short-lived
      // auth-identity cache so the next scope lookup sees the new membership
      // (otherwise the dashboard guard bounces them back to /onboarding until
      // the cache TTL lapses).
      await this.authCache.invalidate(userId);
      return created as unknown as WorkspaceSummary;
    } catch (err) {
      const message = (err as Error).message || '';
      // unique_violation on slug
      if (message.includes('Unique constraint') && message.includes('slug')) {
        throw new ConflictException(`Slug "${slug}" is already taken. Pick another.`);
      }
      throw err;
    }
  }

  /** Read the caller's primary workspace (the one they're an active member of). */
  async getForUser(userId: string): Promise<WorkspaceSummary> {
    const membership = await this.prisma.workspace_members.findFirst({
      where: { user_id: userId, status: 'active' },
      orderBy: { joined_at: 'asc' },
      include: { workspaces: true },
    });
    if (!membership) {
      throw new NotFoundException('No workspace found for this user.');
    }
    return membership.workspaces as unknown as WorkspaceSummary;
  }

  /** Read a workspace by id. Caller must already be authorised (controller checks). */
  async getById(workspaceId: string): Promise<WorkspaceSummary> {
    const ws = await this.prisma.workspaces.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found.`);
    return ws as unknown as WorkspaceSummary;
  }

  /**
   * Update a workspace's mutable fields. Status changes (`active|suspended|
   * deleted`) require super_admin — enforce in the controller, NOT here.
   */
  async update(
    workspaceId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceSummary> {
    const data: Record<string, unknown> = {};
    for (const k of Object.keys(dto) as (keyof UpdateWorkspaceDto)[]) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update.');
    }
    try {
      const ws = await this.prisma.workspaces.update({
        where: { id: workspaceId },
        data,
      });
      return ws as unknown as WorkspaceSummary;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unique constraint') && message.includes('slug')) {
        throw new ConflictException(`Slug "${dto.slug}" is already taken. Pick another.`);
      }
      throw err;
    }
  }

  /** List active members of a workspace. */
  async listMembers(workspaceId: string) {
    return this.prisma.workspace_members.findMany({
      where: { workspace_id: workspaceId, status: { not: 'disabled' } },
      orderBy: { joined_at: 'asc' },
    });
  }

  private deriveSlug(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'workspace';
  }
}
