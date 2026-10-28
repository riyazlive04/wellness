import {
  BadGatewayException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { PrismaService } from '../database/prisma.service';

/**
 * Sign in as a demo staff account, for showing NUSI to a prospect.
 *
 * The point is to demonstrate what a receptionist or an assistant actually
 * sees, which a role preview cannot do convincingly - the person watching
 * wants to believe they are looking at that user's account, not a simulation.
 *
 * It mints a one-time Supabase magic link rather than shipping passwords to
 * the browser. Passwords in frontend code would be readable by anyone who
 * opens devtools on nusi.in, and these are real logins to a real workspace.
 * The service-role key never leaves the server; the browser only ever
 * receives a short-lived link for an account it was already allowed to use.
 *
 * Two conditions, both required:
 *   - the caller is a super admin, or owns the designated demo workspace
 *   - the TARGET is an active member of that same demo workspace
 *
 * So this cannot be pointed at a real practice's staff, and a real practice
 * owner cannot use it at all.
 */

/** The one workspace this is allowed to operate on. */
const DEMO_WORKSPACE_NAME = 'Sirah Digital Nutritionist';

class SwitchDto {
  @IsEmail() email!: string;
}

interface DemoMember {
  user_id: string;
  email: string;
  role: string;
  name: string | null;
}

@ApiTags('Demo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'demo', version: '1' })
export class DemoSwitchController {
  private readonly logger = new Logger(DemoSwitchController.name);
  private readonly supabaseUrl: string;
  private readonly serviceKey: string;
  private readonly siteUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    this.serviceKey = config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.siteUrl = config.get<string>('PUBLIC_SITE_URL') ?? 'https://nusi.in';
  }

  /** The demo workspace, or null when this deployment has none. */
  private async demoWorkspaceId(): Promise<string | null> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.workspaces WHERE name = $1 AND status = 'active' LIMIT 1`,
      DEMO_WORKSPACE_NAME,
    );
    return row?.id ?? null;
  }

  /**
   * May this caller use the switcher at all? A super admin always may; so may
   * whoever owns the demo workspace, since that is the account a salesperson
   * signs into before showing it.
   */
  private async assertAllowed(user: AuthUser, workspaceId: string): Promise<void> {
    if (user.isSuperAdmin) return;
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ role: string }>>(
      `SELECT role::text AS role FROM public.workspace_members
        WHERE workspace_id = $1::uuid AND user_id = $2::uuid AND status = 'active'
        LIMIT 1`,
      workspaceId,
      user.id,
    );
    if (row?.role !== 'owner') {
      throw new ForbiddenException('Only the demo account owner can switch roles.');
    }
  }

  @Get('accounts')
  @ApiOperation({ summary: 'Staff of the demo workspace that can be switched to.' })
  async accounts(@CurrentUser() user: AuthUser) {
    const workspaceId = await this.demoWorkspaceId();
    // No demo workspace is not an error: the switcher simply does not appear.
    if (!workspaceId) return { data: [] };
    try {
      await this.assertAllowed(user, workspaceId);
    } catch {
      return { data: [] };
    }

    const rows = await this.prisma.$queryRawUnsafe<DemoMember[]>(
      `SELECT m.user_id, u.email, m.role::text AS role,
              u.raw_user_meta_data->>'name' AS name
         FROM public.workspace_members m
         JOIN auth.users u ON u.id = m.user_id
        WHERE m.workspace_id = $1::uuid AND m.status = 'active'
        ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, u.email`,
      workspaceId,
    );
    return { data: rows.map((r) => ({ ...r, current: r.user_id === user.id })) };
  }

  @Post('switch')
  @HttpCode(200)
  @ApiOperation({ summary: 'One-time sign-in link for a demo staff account.' })
  async switch(@CurrentUser() user: AuthUser, @Body() dto: SwitchDto) {
    const workspaceId = await this.demoWorkspaceId();
    if (!workspaceId) throw new NotFoundException('No demo workspace on this deployment.');
    await this.assertAllowed(user, workspaceId);

    // The target must belong to the demo workspace. Without this check the
    // endpoint would mint a sign-in link for any account whose email was
    // guessed, which is a full account takeover.
    const email = dto.email.trim().toLowerCase();
    const [member] = await this.prisma.$queryRawUnsafe<DemoMember[]>(
      `SELECT m.user_id, u.email, m.role::text AS role,
              u.raw_user_meta_data->>'name' AS name
         FROM public.workspace_members m
         JOIN auth.users u ON u.id = m.user_id
        WHERE m.workspace_id = $1::uuid AND m.status = 'active'
          AND lower(u.email) = $2
        LIMIT 1`,
      workspaceId,
      email,
    );
    if (!member) {
      throw new ForbiddenException('That account is not part of the demo workspace.');
    }

    const res = await fetch(`${this.supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'magiclink',
        email,
        options: { redirect_to: `${this.siteUrl}/auth` },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`generate_link ${res.status} for demo switch: ${detail.slice(0, 200)}`);
      throw new BadGatewayException('Could not create the sign-in link.');
    }

    const body = (await res.json()) as {
      properties?: { action_link?: string; hashed_token?: string };
      action_link?: string;
    };
    const link = body.properties?.action_link ?? body.action_link;
    if (!link) throw new BadGatewayException('Supabase returned no sign-in link.');

    this.logger.log(
      `Demo switch: ${user.email ?? user.id} -> ${email} (${member.role})`,
    );
    return {
      data: {
        link,
        email,
        role: member.role,
        name: member.name,
        // Verification tokens are short-lived; say so rather than letting a
        // stale link fail silently in front of a prospect.
        expiresInMinutes: 60,
      },
    };
  }
}
