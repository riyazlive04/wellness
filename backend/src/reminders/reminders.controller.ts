import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength,
  MinLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { MAX_CUSTOM } from './reminder-settings';
import { MEAL_SLOTS } from '../meal-plans/meal-plans.types';
import { RemindersService, type QuickReminderKind } from './reminders.service';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

class CustomReminderDto {
  @IsOptional() @IsString() @MaxLength(40) id?: string;
  @Matches(HHMM) time!: string;
  @IsString() @MinLength(1) @MaxLength(60) title!: string;
  @IsOptional() @IsString() @MaxLength(140) body?: string;
}

/** What the client app may change: times and on / off switches. */
export class MyReminderSettingsDto {
  @IsBoolean() meals_enabled!: boolean;
  /** Meal time → "HH:MM" on the phone's clock, e.g. { breakfast: "08:30" }. */
  @IsObject() meal_times!: Record<string, string>;
  @IsBoolean() water_enabled!: boolean;
  @Matches(HHMM) water_start!: string;
  @Matches(HHMM) water_end!: string;
  @IsIn([30, 60, 90, 120]) water_every_minutes!: number;
  @IsOptional() @IsBoolean() custom_enabled?: boolean;
}

/** What the nutritionist sets: everything, including their own reminders. */
class ReminderSettingsDto extends MyReminderSettingsDto {
  @IsArray() @ArrayMaxSize(MAX_CUSTOM) @ValidateNested({ each: true }) @Type(() => CustomReminderDto)
  custom!: CustomReminderDto[];
}

class SequenceDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ValidateNested() @Type(() => ReminderSettingsDto) settings!: ReminderSettingsDto;
}

class UpdateSequenceDto extends SequenceDto {
  /** Also give the new version to clients already on this sequence. */
  @IsOptional() @IsBoolean() reapply?: boolean;
}

class QuickReminderDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID(undefined, { each: true })
  clientIds!: string[];
  @IsIn(['water', 'meal', 'log_meal', 'custom']) kind!: QuickReminderKind;
  @IsOptional() @IsIn(MEAL_SLOTS as unknown as string[]) slot?: string;
  @ValidateIf((o: QuickReminderDto) => o.kind === 'custom') @IsString() @MinLength(1) @MaxLength(200) message?: string;
}

class ApplySequenceDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID(undefined, { each: true })
  clientIds!: string[];
}

/**
 * The nutritionist's side: reusable reminder sequences for the practice, and
 * each client's reminders set by hand.
 */
@ApiTags('Reminders')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me', version: '1' })
@WorkspaceRole('owner', 'nutritionist')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  private ws(user: AuthUser): string {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return user.workspaceId;
  }

  @Get('reminder-sequences')
  @ApiOperation({ summary: "The practice's reminder sequences, with how many clients are on each." })
  async list(@CurrentUser() user: AuthUser) {
    return { data: await this.reminders.listSequences(this.ws(user)) };
  }

  @Post('reminder-sequences')
  @RequirePermission('clients.write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a reminder sequence.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: SequenceDto) {
    return { data: await this.reminders.createSequence(this.ws(user), user.id, dto) };
  }

  @Put('reminder-sequences/:id')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Save a reminder sequence; optionally update the clients already on it.' })
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSequenceDto) {
    return { data: await this.reminders.updateSequence(this.ws(user), id, dto, !!dto.reapply) };
  }

  @Delete('reminder-sequences/:id')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Delete a sequence. Clients keep the reminders they have.' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.reminders.deleteSequence(this.ws(user), id) };
  }

  @Post('reminder-sequences/:id/apply')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: "Give clients this sequence's reminders (replaces theirs)." })
  async apply(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplySequenceDto) {
    return { data: { updated: await this.reminders.applySequence(this.ws(user), id, dto.clientIds) } };
  }

  @Post('quick-reminders')
  @RequirePermission('clients.write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a one-off reminder now (water, meal, log your meal, or your own words). Pops up in the client app.' })
  async quick(@CurrentUser() user: AuthUser, @Body() dto: QuickReminderDto) {
    return { data: await this.reminders.sendQuick(this.ws(user), dto) };
  }

  @Get('clients/:clientId/reminders')
  @ApiOperation({ summary: "A client's reminders (null = never set up)." })
  async clientReminders(@CurrentUser() user: AuthUser, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return { data: await this.reminders.clientSettings(this.ws(user), clientId) };
  }

  @Put('clients/:clientId/reminders')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: "Set a client's reminders by hand." })
  async setClientReminders(
    @CurrentUser() user: AuthUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: ReminderSettingsDto,
  ) {
    return { data: await this.reminders.setClientSettings(this.ws(user), clientId, dto) };
  }
}

/** The client's side, from their app. */
@ApiTags('Me · Client portal')
@ApiBearerAuth()
@Controller({ path: 'me/reminders', version: '1' })
export class MyRemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  @ApiOperation({ summary: 'Reminders the app schedules on the phone (null = never set up).' })
  async get(@CurrentUser() user: AuthUser) {
    return { data: await this.reminders.mySettings(user.id) };
  }

  @Put()
  @ApiOperation({ summary: "Change reminder times and switches. The nutritionist's own reminders are kept." })
  async set(@CurrentUser() user: AuthUser, @Body() dto: MyReminderSettingsDto) {
    return { data: await this.reminders.setMySettings(user.id, dto) };
  }
}
