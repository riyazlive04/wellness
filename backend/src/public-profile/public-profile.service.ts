import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClientsService } from '../clients/clients.service';
import { PrismaService } from '../database/prisma.service';
import { VerificationService } from '../verification/verification.service';
import { PatchPublicProfileDto, ProfileLinkDto } from './dto/public-profile.dto';

const LINK_ICONS = new Set(['whatsapp', 'instagram', 'youtube', 'website', 'calendar', 'shop', 'custom']);

export interface PublicProfileLinkView {
  id: string;
  label: string;
  url: string;
  icon: string;
  sort_order: number;
}

export interface PublicProfileView {
  slug: string;
  name: string;
  logo_url: string | null;
  brand_color: string | null;
  brand_accent: string | null;
  tagline: string | null;
  headline: string | null;
  bio: string | null;
  verified: boolean;
  show_join_cta: boolean;
  join_url: string | null;
  links: PublicProfileLinkView[];
}

export interface OwnerPublicProfileView {
  enabled: boolean;
  headline: string | null;
  bio: string | null;
  show_join_cta: boolean;
  slug: string | null;
  public_url: string | null;
  links: Array<PublicProfileLinkView & { enabled: boolean }>;
}

@Injectable()
export class PublicProfileService {
  private readonly logger = new Logger(PublicProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly verification: VerificationService,
  ) {}

  private frontendOrigin(): string {
    return (process.env.FRONTEND_ORIGIN ?? 'http://localhost:4000').split(',')[0].trim();
  }

  private publicUrl(slug: string | null): string | null {
    if (!slug) return null;
    return `${this.frontendOrigin()}/${encodeURIComponent(slug)}`;
  }

  private async ensureProfileRow(workspaceId: string): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.workspace_public_profiles (workspace_id)
       VALUES ($1::uuid)
       ON CONFLICT (workspace_id) DO NOTHING`,
      workspaceId,
    );
  }

  async getOwnerProfile(workspaceId: string): Promise<OwnerPublicProfileView> {
    await this.ensureProfileRow(workspaceId);

    const [ws] = await this.prisma.$queryRawUnsafe<Array<{ slug: string | null }>>(
      `SELECT slug FROM public.workspaces WHERE id = $1::uuid`,
      workspaceId,
    );
    if (!ws) throw new NotFoundException('Workspace not found');

    const [profile] = await this.prisma.$queryRawUnsafe<
      Array<{
        enabled: boolean;
        headline: string | null;
        bio: string | null;
        show_join_cta: boolean;
      }>
    >(
      `SELECT enabled, headline, bio, show_join_cta
         FROM public.workspace_public_profiles
        WHERE workspace_id = $1::uuid`,
      workspaceId,
    );

    const links = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        label: string;
        url: string;
        icon: string;
        sort_order: number;
        enabled: boolean;
      }>
    >(
      `SELECT id, label, url, icon, sort_order, enabled
         FROM public.workspace_profile_links
        WHERE workspace_id = $1::uuid
        ORDER BY sort_order ASC, created_at ASC`,
      workspaceId,
    );

    return {
      enabled: profile?.enabled ?? false,
      headline: profile?.headline ?? null,
      bio: profile?.bio ?? null,
      show_join_cta: profile?.show_join_cta ?? true,
      slug: ws.slug,
      public_url: this.publicUrl(ws.slug),
      links: links.map((l) => ({
        id: l.id,
        label: l.label,
        url: l.url,
        icon: l.icon,
        sort_order: l.sort_order,
        enabled: l.enabled,
      })),
    };
  }

  async patchOwnerProfile(workspaceId: string, dto: PatchPublicProfileDto): Promise<OwnerPublicProfileView> {
    await this.ensureProfileRow(workspaceId);

    if (dto.enabled === true) {
      const [ws] = await this.prisma.$queryRawUnsafe<Array<{ slug: string | null }>>(
        `SELECT slug FROM public.workspaces WHERE id = $1::uuid`,
        workspaceId,
      );
      if (!ws?.slug) {
        throw new BadRequestException(
          'Set a workspace slug before publishing your public page (Settings → General).',
        );
      }
    }

    await this.prisma.$queryRawUnsafe(
      `UPDATE public.workspace_public_profiles
          SET enabled       = COALESCE($2, enabled),
              headline      = CASE WHEN $3::boolean THEN $4 ELSE headline END,
              bio           = CASE WHEN $5::boolean THEN $6 ELSE bio END,
              show_join_cta = COALESCE($7, show_join_cta),
              updated_at    = now()
        WHERE workspace_id = $1::uuid`,
      workspaceId,
      dto.enabled ?? null,
      dto.headline !== undefined,
      dto.headline === undefined ? null : dto.headline,
      dto.bio !== undefined,
      dto.bio === undefined ? null : dto.bio,
      dto.show_join_cta ?? null,
    );

    return this.getOwnerProfile(workspaceId);
  }

  async replaceLinks(workspaceId: string, links: ProfileLinkDto[]): Promise<OwnerPublicProfileView> {
    if (links.length > 40) {
      throw new BadRequestException('At most 40 links are allowed.');
    }

    for (const link of links) {
      const icon = link.icon ?? 'custom';
      if (!LINK_ICONS.has(icon)) {
        throw new BadRequestException(`Invalid link icon: ${icon}`);
      }
      try {
        // eslint-disable-next-line no-new
        new URL(link.url);
      } catch {
        throw new BadRequestException(`Invalid URL for link "${link.label}"`);
      }
      if (!link.label.trim()) {
        throw new BadRequestException('Link label is required.');
      }
    }

    await this.ensureProfileRow(workspaceId);

    await this.prisma.$executeRawUnsafe(
      `DELETE FROM public.workspace_profile_links WHERE workspace_id = $1::uuid`,
      workspaceId,
    );

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.workspace_profile_links
           (workspace_id, label, url, sort_order, icon, enabled)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)`,
        workspaceId,
        link.label.trim(),
        link.url.trim(),
        i,
        link.icon ?? 'custom',
        link.enabled ?? true,
      );
    }

    return this.getOwnerProfile(workspaceId);
  }

  /**
   * Unauthenticated prospect view. Only published profiles resolve.
   * Ensures a live join token when the Join CTA is enabled.
   */
  async getPublicBySlug(slug: string, actorUserId?: string): Promise<PublicProfileView> {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) throw new NotFoundException('Profile not found');

    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        workspace_id: string;
        slug: string;
        name: string;
        display_name: string | null;
        logo_url: string | null;
        brand_color: string | null;
        brand_accent: string | null;
        tagline: string | null;
        headline: string | null;
        bio: string | null;
        show_join_cta: boolean;
      }>
    >(
      `SELECT w.id AS workspace_id, w.slug, w.name, w.display_name, w.logo_url,
              w.brand_color, w.brand_accent, w.tagline,
              p.headline, p.bio, p.show_join_cta
         FROM public.workspaces w
         JOIN public.workspace_public_profiles p ON p.workspace_id = w.id
        WHERE lower(w.slug) = $1
          AND p.enabled = true
          AND w.status = 'active'
        LIMIT 1`,
      normalized,
    );

    if (!row?.slug) throw new NotFoundException('Profile not found');

    let verified = false;
    try {
      const v = await this.verification.getForWorkspace(row.workspace_id);
      verified = v.status === 'verified';
    } catch (err) {
      this.logger.warn(`Verification lookup failed for ${row.workspace_id}: ${(err as Error).message}`);
    }

    const links = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; label: string; url: string; icon: string; sort_order: number }>
    >(
      `SELECT id, label, url, icon, sort_order
         FROM public.workspace_profile_links
        WHERE workspace_id = $1::uuid AND enabled = true
        ORDER BY sort_order ASC, created_at ASC`,
      row.workspace_id,
    );

    let joinUrl: string | null = null;
    if (row.show_join_cta) {
      joinUrl = await this.ensureJoinUrl(row.workspace_id, actorUserId);
    }

    return {
      slug: row.slug,
      name: row.display_name?.trim() || row.name,
      logo_url: row.logo_url,
      brand_color: row.brand_color,
      brand_accent: row.brand_accent,
      tagline: row.tagline,
      headline: row.headline,
      bio: row.bio,
      verified,
      show_join_cta: row.show_join_cta,
      join_url: joinUrl,
      links: links.map((l) => ({
        id: l.id,
        label: l.label,
        url: l.url,
        icon: l.icon,
        sort_order: l.sort_order,
      })),
    };
  }

  private async ensureJoinUrl(workspaceId: string, actorUserId?: string): Promise<string | null> {
    const current = await this.clients.getJoinLink(workspaceId);
    if (current.token && !current.is_expired && current.url) return current.url;

    // Public page may be hit anonymously — rotate with the workspace owner as actor.
    let actor = actorUserId;
    if (!actor) {
      const [owner] = await this.prisma.$queryRawUnsafe<Array<{ owner_id: string }>>(
        `SELECT owner_id FROM public.workspaces WHERE id = $1::uuid`,
        workspaceId,
      );
      actor = owner?.owner_id;
    }
    if (!actor) return null;

    const rotated = await this.clients.rotateJoinLink(workspaceId, actor, 90);
    return rotated.url;
  }
}
