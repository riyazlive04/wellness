import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface PrivacyPolicy {
  id: string;
  version: number;
  title: string;
  content: string;
  published_at: string;
  published_by: string | null;
}

export interface CurrentPolicyForUser {
  policy: PrivacyPolicy | null;
  accepted: boolean;
  /** True when the caller is a workspace owner who must accept before continuing. */
  must_accept: boolean;
}

@Injectable()
export class PoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reads ──────────────────────────────────────────────────────────

  async getCurrent(): Promise<PrivacyPolicy | null> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string; version: number; title: string; content: string;
        published_at: Date; published_by: string | null;
      }>
    >(
      `SELECT id, version, title, content, published_at, published_by
         FROM public.privacy_policies
        WHERE is_current = true
        ORDER BY version DESC
        LIMIT 1`,
    );
    return row ? this.toPolicy(row) : null;
  }

  async listVersions(): Promise<PrivacyPolicy[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string; version: number; title: string; content: string;
        published_at: Date; published_by: string | null;
      }>
    >(
      `SELECT id, version, title, content, published_at, published_by
         FROM public.privacy_policies
        ORDER BY version DESC
        LIMIT 50`,
    );
    return rows.map((r) => this.toPolicy(r));
  }

  async getCurrentForUser(
    userId: string,
    workspaceRole: string | null,
  ): Promise<CurrentPolicyForUser> {
    const policy = await this.getCurrent();
    if (!policy) return { policy: null, accepted: true, must_accept: false };

    const [hit] = await this.prisma.$queryRawUnsafe<Array<{ one: number }>>(
      `SELECT 1 AS one FROM public.policy_acceptances
        WHERE policy_id = $1::uuid AND user_id = $2::uuid LIMIT 1`,
      policy.id,
      userId,
    );
    const accepted = !!hit;
    // Only workspace owners are forced to accept before using the app.
    const must_accept = !accepted && workspaceRole === 'owner';
    return { policy, accepted, must_accept };
  }

  // ── Writes ─────────────────────────────────────────────────────────

  /** Publish a new version. Supersedes the previous current policy. */
  async publish(
    input: { title?: string; content: string },
    userId: string,
  ): Promise<PrivacyPolicy> {
    const content = input.content?.trim();
    if (!content) throw new BadRequestException('Policy content is required.');
    const title = input.title?.trim() || 'Privacy Policy';

    return this.prisma.$transaction(async (tx) => {
      const [{ next }] = await tx.$queryRawUnsafe<Array<{ next: number }>>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM public.privacy_policies`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE public.privacy_policies SET is_current = false WHERE is_current = true`,
      );
      const [row] = await tx.$queryRawUnsafe<
        Array<{
          id: string; version: number; title: string; content: string;
          published_at: Date; published_by: string | null;
        }>
      >(
        `INSERT INTO public.privacy_policies (version, title, content, is_current, published_by)
         VALUES ($1, $2, $3, true, $4::uuid)
         RETURNING id, version, title, content, published_at, published_by`,
        Number(next),
        title,
        content,
        userId,
      );
      return this.toPolicy(row);
    });
  }

  /** Record the caller's acceptance of the current policy (idempotent). */
  async acceptCurrent(
    userId: string,
    workspaceId: string | null,
  ): Promise<{ accepted: true; version: number }> {
    const policy = await this.getCurrent();
    if (!policy) throw new BadRequestException('No privacy policy is published yet.');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.policy_acceptances (policy_id, policy_version, user_id, workspace_id)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid)
       ON CONFLICT (policy_id, user_id) DO NOTHING`,
      policy.id,
      policy.version,
      userId,
      workspaceId,
    );
    return { accepted: true, version: policy.version };
  }

  private toPolicy(r: {
    id: string; version: number; title: string; content: string;
    published_at: Date; published_by: string | null;
  }): PrivacyPolicy {
    return {
      id: r.id,
      version: Number(r.version),
      title: r.title,
      content: r.content,
      published_at: r.published_at.toISOString(),
      published_by: r.published_by,
    };
  }
}
