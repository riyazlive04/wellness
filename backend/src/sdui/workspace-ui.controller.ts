/**
 * Server-driven UI — the authoring endpoints behind the web editor.
 *
 * Gated on `settings.manage`, the same permission that covers branding: an
 * owner can delegate "shape the client app" to a manager without also handing
 * over billing. Publishing is the one action that reaches real phones, so it is
 * separate from saving and audited on its own.
 */
import { Body, Controller, Delete, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { Audit } from '../admin/audit/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  ACTIVITY_LEVELS,
  LIMITS,
  NATIVE_COMPONENTS,
  NODE_SPECS,
  ONBOARDING_FIELD_KEYS,
  ROUTES,
  TAB_ROUTES,
} from './sdui.registry';
import { SduiService } from './sdui.service';
import { DATA_SOURCES, SCHEMA_VERSION, SCREEN_KEYS, type ScreenKey } from './sdui.types';

class SaveLayoutDto {
  /** The full screen tree. Validated by SduiService, not class-validator. */
  tree!: unknown;
}

class PublishDto {
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class RestoreDto {
  @IsInt() @Min(1) revision!: number;
}

class ValidateDto {
  tree!: unknown;
}

function assertScreen(screen: string): ScreenKey {
  if (!(SCREEN_KEYS as readonly string[]).includes(screen)) {
    throw new ForbiddenException(`Unknown screen "${screen}".`);
  }
  return screen as ScreenKey;
}

@ApiTags('Workspace · App layout')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/ui-layouts', version: '1' })
export class WorkspaceUiController {
  constructor(private readonly sdui: SduiService) {}

  private wsOf(u: AuthUser): string {
    if (!u.workspaceId) throw new ForbiddenException('Not in a workspace');
    return u.workspaceId;
  }

  /**
   * The editor's capability manifest.
   *
   * The web editor builds its palette, its property forms and its destination
   * pickers from this rather than from a copy of the catalog. One table on the
   * server, one source of truth — a node type added here shows up in the editor
   * on the next page load with no frontend deploy.
   */
  @Get('catalog')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Node specs, routes and limits the editor builds its UI from.' })
  catalog() {
    return {
      data: {
        schemaVersion: SCHEMA_VERSION,
        screens: SCREEN_KEYS,
        nodes: NODE_SPECS,
        routes: ROUTES,
        tabRoutes: TAB_ROUTES,
        dataSources: DATA_SOURCES,
        nativeComponents: NATIVE_COMPONENTS,
        onboardingFieldKeys: ONBOARDING_FIELD_KEYS,
        activityLevels: ACTIVITY_LEVELS,
        limits: LIMITS,
      },
    };
  }

  @Get()
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Editor state for every server-driven screen.' })
  async list(@CurrentUser() u: AuthUser) {
    return { data: await this.sdui.listForWorkspace(this.wsOf(u)) };
  }

  @Get(':screen')
  @RequirePermission('settings.manage')
  async getOne(@CurrentUser() u: AuthUser, @Param('screen') screen: string) {
    return { data: await this.sdui.getScreen(this.wsOf(u), assertScreen(screen)) };
  }

  /** Dry run. Powers the editor's inline error list without touching storage. */
  @Post(':screen/validate')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Check a tree and return per-node errors. Stores nothing.' })
  validate(@Param('screen') screen: string, @Body() dto: ValidateDto) {
    return { data: this.sdui.validate(dto.tree, assertScreen(screen)) };
  }

  @Post(':screen/draft')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Save the working copy. Does not affect live apps.' })
  async saveDraft(
    @CurrentUser() u: AuthUser,
    @Param('screen') screen: string,
    @Body() dto: SaveLayoutDto,
  ) {
    return {
      data: await this.sdui.saveDraft(this.wsOf(u), assertScreen(screen), dto.tree, u.id),
    };
  }

  @Delete(':screen/draft')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Throw away unpublished changes.' })
  async discardDraft(@CurrentUser() u: AuthUser, @Param('screen') screen: string) {
    return { data: await this.sdui.discardDraft(this.wsOf(u), assertScreen(screen)) };
  }

  @Post(':screen/default')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Load the built-in stock layout into the draft.' })
  async resetToDefault(@CurrentUser() u: AuthUser, @Param('screen') screen: string) {
    return {
      data: await this.sdui.resetDraftToDefault(this.wsOf(u), assertScreen(screen), u.id),
    };
  }

  /** The only action that reaches real devices — hence its own audit entry. */
  @Post(':screen/publish')
  @RequirePermission('settings.manage')
  @Audit({ action: 'workspace.ui_layout.publish', resourceType: 'workspace', resourceIdParam: 'screen' })
  @ApiOperation({ summary: 'Make the draft live for every client on this workspace.' })
  async publish(
    @CurrentUser() u: AuthUser,
    @Param('screen') screen: string,
    @Body() dto: PublishDto,
  ) {
    return {
      data: await this.sdui.publish(this.wsOf(u), assertScreen(screen), u.id, dto.note),
    };
  }

  @Delete(':screen/publish')
  @RequirePermission('settings.manage')
  @Audit({ action: 'workspace.ui_layout.unpublish', resourceType: 'workspace', resourceIdParam: 'screen' })
  @ApiOperation({ summary: 'Stop serving a custom layout; clients fall back to the stock screen.' })
  async unpublish(@CurrentUser() u: AuthUser, @Param('screen') screen: string) {
    return { data: await this.sdui.unpublish(this.wsOf(u), assertScreen(screen)) };
  }

  @Get(':screen/history')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Past published revisions, newest first.' })
  async history(@CurrentUser() u: AuthUser, @Param('screen') screen: string) {
    return { data: await this.sdui.history(this.wsOf(u), assertScreen(screen)) };
  }

  @Post(':screen/restore')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Load a past revision into the draft, ready to review and publish.' })
  async restore(
    @CurrentUser() u: AuthUser,
    @Param('screen') screen: string,
    @Body() dto: RestoreDto,
  ) {
    return {
      data: await this.sdui.restore(this.wsOf(u), assertScreen(screen), dto.revision, u.id),
    };
  }
}
