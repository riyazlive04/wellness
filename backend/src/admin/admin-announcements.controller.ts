import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { PrismaService } from '../database/prisma.service';
import { Audit } from './audit/audit.decorator';

/** workspace_member_role enum values — audiences for role targeting. */
const TARGET_ROLES = [
  'owner',
  'nutritionist',
  'assistant_nutritionist',
  'receptionist',
  'coach',
  'support',
] as const;

class UpsertAnnouncementDto {
  @IsString() @MinLength(2) @MaxLength(140)  title!: string;
  @IsString() @MinLength(2) @MaxLength(2000) body!: string;
  @IsOptional() @IsIn(['info', 'warning', 'critical']) severity?: 'info' | 'warning' | 'critical';
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) target_workspace_ids?: string[];
  @IsOptional() @IsArray() @IsIn(TARGET_ROLES, { each: true }) target_roles?: string[];
  @IsOptional() @IsDateString() starts_at?: string;
  @IsOptional() @IsDateString() ends_at?: string;
  @IsOptional() @IsBoolean() dismissible?: boolean;
}

@ApiTags('Announcements')
@ApiBearerAuth()
@Controller({ version: '1' })
export class AnnouncementsController {
  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────────
  // Super-admin CRUD
  // ────────────────────────────────────────────────────────────────

  @Get('admin/announcements')
  @SuperAdmin()
  @ApiOperation({ summary: 'List ALL announcements (published or draft).' })
  async list() {
    const items = await this.prisma.platform_announcements.findMany({
      orderBy: { created_at: 'desc' },
    });
    return { data: { items } };
  }

  @Post('admin/announcements')
  @SuperAdmin()
  @Audit({ action: 'announcement.create', resourceType: 'announcement' })
  @ApiOperation({ summary: 'Create a new announcement (draft, not yet published).' })
  async create(@Body() dto: UpsertAnnouncementDto, @CurrentUser() user: AuthUser) {
    const created = await this.prisma.platform_announcements.create({
      data: {
        title: dto.title,
        body: dto.body,
        severity: dto.severity ?? 'info',
        target_workspace_ids: dto.target_workspace_ids ?? [],
        target_roles: dto.target_roles ?? [],
        starts_at: dto.starts_at ? new Date(dto.starts_at) : undefined,
        ends_at: dto.ends_at ? new Date(dto.ends_at) : null,
        dismissible: dto.dismissible ?? true,
        created_by: user.id,
      },
    });
    return { data: created };
  }

  @Patch('admin/announcements/:id')
  @SuperAdmin()
  @Audit({ action: 'announcement.update', resourceType: 'announcement', resourceIdParam: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpsertAnnouncementDto) {
    const updated = await this.prisma.platform_announcements.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        severity: dto.severity,
        target_workspace_ids: dto.target_workspace_ids,
        target_roles: dto.target_roles,
        starts_at: dto.starts_at ? new Date(dto.starts_at) : undefined,
        ends_at: dto.ends_at ? new Date(dto.ends_at) : undefined,
        dismissible: dto.dismissible,
      },
    });
    return { data: updated };
  }

  @Post('admin/announcements/:id/publish')
  @HttpCode(200)
  @SuperAdmin()
  @Audit({ action: 'announcement.publish', resourceType: 'announcement', resourceIdParam: 'id' })
  async publish(@Param('id') id: string) {
    const updated = await this.prisma.platform_announcements.update({
      where: { id },
      data: { published_at: new Date() },
    });
    return { data: updated };
  }

  @Post('admin/announcements/:id/unpublish')
  @HttpCode(200)
  @SuperAdmin()
  @Audit({ action: 'announcement.unpublish', resourceType: 'announcement', resourceIdParam: 'id' })
  async unpublish(@Param('id') id: string) {
    const updated = await this.prisma.platform_announcements.update({
      where: { id },
      data: { published_at: null },
    });
    return { data: updated };
  }

  @Delete('admin/announcements/:id')
  @HttpCode(200)
  @SuperAdmin()
  @Audit({ action: 'announcement.delete', resourceType: 'announcement', resourceIdParam: 'id' })
  async remove(@Param('id') id: string) {
    await this.prisma.platform_announcements.delete({ where: { id } });
    return { data: { id, deleted: true } };
  }

  // ────────────────────────────────────────────────────────────────
  // Public-ish read — for the workspace topbar banner.
  // @Public so unauthed pre-render works; the topbar fetches with
  // a JWT anyway and we use it just to filter target_workspace_ids.
  // ────────────────────────────────────────────────────────────────

  @Get('announcements/active')
  @Public()
  @ApiOperation({ summary: 'Active announcements visible to the current workspace.' })
  async active(@CurrentUser() user?: AuthUser) {
    const workspaceId = user?.workspaceId ?? null;
    const workspaceRole = user?.workspaceRole ?? null;
    const items = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        title: string;
        body: string;
        severity: string;
        dismissible: boolean;
        starts_at: Date;
        ends_at: Date | null;
      }>
    >(
      `SELECT id, title, body, severity, dismissible, starts_at, ends_at
         FROM public.platform_announcements
        WHERE published_at IS NOT NULL
          AND starts_at <= now()
          AND (ends_at IS NULL OR ends_at > now())
          AND (
            target_workspace_ids IS NULL
            OR cardinality(target_workspace_ids) = 0
            OR ($1::uuid IS NOT NULL AND $1::uuid = ANY(target_workspace_ids))
          )
          AND (
            target_roles IS NULL
            OR cardinality(target_roles) = 0
            OR ($2::text IS NOT NULL AND $2::text = ANY(target_roles))
          )
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 0
            WHEN 'warning' THEN 1
            ELSE 2
          END,
          starts_at DESC`,
      workspaceId,
      workspaceRole,
    );
    return { data: { items } };
  }

  // ────────────────────────────────────────────────────────────────
  // Authenticated read — full inbox for a workspace member (the
  // "Announcements" page). Same workspace + role targeting as /active,
  // but WITHOUT the time window so members can review current AND past
  // notices, each flagged active/expired.
  // ────────────────────────────────────────────────────────────────

  @Get('announcements/mine')
  @ApiOperation({ summary: 'All published announcements targeted to the current member (current + past).' })
  async mine(@CurrentUser() user?: AuthUser) {
    const workspaceId = user?.workspaceId ?? null;
    const workspaceRole = user?.workspaceRole ?? null;
    const items = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        title: string;
        body: string;
        severity: string;
        dismissible: boolean;
        published_at: Date;
        starts_at: Date;
        ends_at: Date | null;
        is_active: boolean;
      }>
    >(
      `SELECT id, title, body, severity, dismissible, published_at, starts_at, ends_at,
              (starts_at <= now() AND (ends_at IS NULL OR ends_at > now())) AS is_active
         FROM public.platform_announcements
        WHERE published_at IS NOT NULL
          AND (
            target_workspace_ids IS NULL
            OR cardinality(target_workspace_ids) = 0
            OR ($1::uuid IS NOT NULL AND $1::uuid = ANY(target_workspace_ids))
          )
          AND (
            target_roles IS NULL
            OR cardinality(target_roles) = 0
            OR ($2::text IS NOT NULL AND $2::text = ANY(target_roles))
          )
        ORDER BY published_at DESC`,
      workspaceId,
      workspaceRole,
    );
    return { data: { items } };
  }
}
