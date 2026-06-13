import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { WorkspaceSwitchService } from './workspace-switch.service';

class SwitchWorkspaceDto {
  @IsString() workspaceId!: string;
}

/**
 * Workspace switching (any member) + super-admin impersonation.
 *
 *   GET  /api/v1/workspaces/me/memberships  — workspaces the caller can switch to
 *   GET  /api/v1/workspaces/me/active       — current pinned workspace
 *   POST /api/v1/workspaces/me/switch       — pin a workspace the caller belongs to
 *   POST /api/v1/admin/impersonate          — super admin: act as any workspace
 *   POST /api/v1/admin/impersonate/stop     — clear impersonation
 *
 * A switch takes effect on the NEXT request (JwtStrategy re-reads the pin), so
 * the client should refresh its session/token after calling.
 */
@ApiTags('Workspace Switching')
@ApiBearerAuth()
@Controller({ path: '', version: '1' })
export class WorkspaceSwitchController {
  constructor(private readonly switcher: WorkspaceSwitchService) {}

  @Get('workspaces/me/memberships')
  @ApiOperation({ summary: 'Workspaces the caller is a member of (for the switcher).' })
  async memberships(@CurrentUser() user: AuthUser) {
    return { data: await this.switcher.listMemberships(user.id) };
  }

  @Get('workspaces/me/active')
  @ApiOperation({ summary: 'The caller\'s currently pinned active workspace (if any).' })
  async active(@CurrentUser() user: AuthUser) {
    return { data: await this.switcher.getActive(user.id) };
  }

  @Post('workspaces/me/switch')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pin a different workspace as active (must be a member).' })
  async switch(@CurrentUser() user: AuthUser, @Body() dto: SwitchWorkspaceDto) {
    return { data: await this.switcher.setActive(user.id, dto.workspaceId) };
  }

  @Post('admin/impersonate')
  @SuperAdmin()
  @HttpCode(200)
  @ApiOperation({ summary: 'Super admin: act as a workspace (audited).' })
  async impersonate(@CurrentUser() user: AuthUser, @Body() dto: SwitchWorkspaceDto) {
    return { data: await this.switcher.impersonate(user.id, dto.workspaceId) };
  }

  @Post('admin/impersonate/stop')
  @SuperAdmin()
  @HttpCode(200)
  @ApiOperation({ summary: 'Super admin: stop impersonating.' })
  async stopImpersonating(@CurrentUser() user: AuthUser) {
    return { data: await this.switcher.stop(user.id) };
  }
}
