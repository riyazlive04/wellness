import {
  BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException,
  Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { PrismaService } from '../database/prisma.service';
import { DailyFormsService } from './daily-forms.service';

class SaveEntryDto {
  @IsUUID('4') templateId!: string;
  /** { question_id: answer }. Anything not on the form is ignored. */
  @IsObject() responses!: Record<string, unknown>;
}

class DaysQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

/**
 * The client's own daily log: today's form and saving a day's answers.
 * Every route resolves the caller's client row from their token, so one
 * client can never read or write another's health data.
 */
@ApiTags('Me · Daily log')
@ApiBearerAuth()
@Controller({ path: 'me/daily-form', version: '1' })
export class MyDailyFormController {
  constructor(
    private readonly daily: DailyFormsService,
    private readonly prisma: PrismaService,
  ) {}

  private async me(userId: string): Promise<{ id: string; workspace_id: string }> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string | null }>>(
      `SELECT id, workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!row?.workspace_id) throw new NotFoundException('No client profile linked to this user.');
    return { id: row.id, workspace_id: row.workspace_id };
  }

  @Get('today')
  @ApiOperation({ summary: "Today's daily log form and any answers already saved (null if none assigned)." })
  async today(@CurrentUser() user: AuthUser) {
    const me = await this.me(user.id);
    return { data: await this.daily.todayForClient(me.id, me.workspace_id) };
  }

  @Post('entries')
  @ApiOperation({ summary: "Save today's answers. Saving again the same day updates the entry." })
  async save(@CurrentUser() user: AuthUser, @Body() dto: SaveEntryDto) {
    const me = await this.me(user.id);
    return { data: await this.daily.saveEntry(me.id, me.workspace_id, dto.templateId, dto.responses) };
  }

  @Get('history')
  @ApiOperation({ summary: 'My recent daily entries.' })
  async history(@CurrentUser() user: AuthUser, @Query() q: DaysQuery) {
    const me = await this.me(user.id);
    return { data: await this.daily.history(me.id, q.days ?? 30) };
  }

  @Get('series')
  @ApiOperation({ summary: 'My numeric answers over time, for charts.' })
  async series(@CurrentUser() user: AuthUser, @Query() q: DaysQuery) {
    const me = await this.me(user.id);
    return { data: await this.daily.series(me.id, q.days ?? 30) };
  }
}

/** The nutritionist's view: one client's daily log, and who hasn't logged. */
@ApiTags('Workspace · Daily log')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me', version: '1' })
export class WorkspaceDailyFormController {
  constructor(
    private readonly daily: DailyFormsService,
    private readonly prisma: PrismaService,
  ) {}

  private async assertClient(workspaceId: string, clientId: string): Promise<void> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      clientId,
      workspaceId,
    );
    if (!row) throw new NotFoundException('Client not found in this workspace.');
  }

  @Get('clients/:clientId/daily-form')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: "A client's recent daily entries and charted values." })
  async forClient(
    @CurrentUser() user: AuthUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() q: DaysQuery,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    await this.assertClient(user.workspaceId, clientId);
    const days = q.days ?? 30;
    const [today, history, series] = await Promise.all([
      this.daily.todayForClient(clientId, user.workspaceId),
      this.daily.history(clientId, days),
      this.daily.series(clientId, days),
    ]);
    return { data: { today, history, series } };
  }

  @Get('daily-form/compliance')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Clients on a daily log and when each last filled it in.' })
  async compliance(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.daily.compliance(user.workspaceId) };
  }

  @Post('assessment-forms/:id/daily')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Turn a form into a daily log and choose who fills it in.' })
  async setDaily(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDailyDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    if (dto.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.reminderTime)) {
      throw new BadRequestException('reminderTime must be HH:MM, e.g. 20:00.');
    }
    const ids = [...new Set(dto.clientIds ?? [])];
    for (const c of ids) await this.assertClient(user.workspaceId, c);

    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string; repeat_daily: boolean }>>(
      `UPDATE public.assessment_form_templates
          SET repeat_daily = $3, reminder_time = $4::time,
              assigned_client_ids = $5::uuid[], updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND archived = false
        RETURNING id, repeat_daily`,
      id,
      user.workspaceId,
      dto.repeatDaily,
      dto.reminderTime ?? null,
      ids,
    );
    if (!row) throw new NotFoundException('Form not found.');
    return { data: { ...row, assigned: ids.length } };
  }
}

class SetDailyDto {
  @IsOptional() @IsBoolean() repeatDaily: boolean = true;
  /** Local time to nudge the client, HH:MM. Omit for no reminder. */
  @IsOptional() @IsString() reminderTime?: string;
  /** Clients who should fill it in. Replaces the current list. */
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('4', { each: true }) clientIds?: string[];
}
