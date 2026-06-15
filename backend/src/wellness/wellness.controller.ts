import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { WellnessService } from './wellness.service';

const GOAL_CATEGORIES = ['lifestyle', 'fitness', 'nutrition', 'habit', 'mindfulness', 'other'];

class CreateGoalDtoIn {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(GOAL_CATEGORIES) category?: string;
  @IsOptional() @IsNumber() targetValue?: number;
  @IsOptional() @IsNumber() currentValue?: number;
  @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @IsOptional() @IsString() targetDate?: string;
}
class UpdateGoalDtoIn extends CreateGoalDtoIn {
  @IsOptional() @IsString() declare title: string;
  @IsOptional() @IsIn(['active', 'achieved', 'archived']) status?: string;
}
class CreateHabitDtoIn {
  @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsIn(['daily', 'weekly']) cadence?: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) targetPerDay?: number;
  @IsOptional() @IsInt() sortOrder?: number;
}
class UpdateHabitDtoIn extends CreateHabitDtoIn {
  @IsOptional() @IsString() declare title: string;
}
class ToggleHabitDtoIn {
  @IsOptional() @IsString() date?: string;
}
class CreateJournalDtoIn {
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) mood?: number;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() entryDate?: string;
}
class UpdateJournalDtoIn {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) body?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) mood?: number;
  @IsOptional() @IsArray() tags?: string[];
}

/**
 * Module 7 — Client Wellness OS API. All routes resolve the caller's client row
 * from the JWT (clients.user_id), so the surface is automatically self-scoped.
 */
@ApiTags('Wellness OS')
@ApiBearerAuth()
@Controller({ path: 'me/wellness', version: '1' })
export class WellnessController {
  constructor(private readonly wellness: WellnessService) {}

  // ── Goals ──
  @Get('goals')
  async listGoals(@CurrentUser() u: AuthUser) { return { data: await this.wellness.listGoals(u.id) }; }

  @Post('goals')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a wellness goal.' })
  async createGoal(@CurrentUser() u: AuthUser, @Body() dto: CreateGoalDtoIn) {
    return { data: await this.wellness.createGoal(u.id, dto) };
  }

  @Patch('goals/:id')
  async updateGoal(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateGoalDtoIn) {
    return { data: await this.wellness.updateGoal(u.id, id, dto) };
  }

  @Delete('goals/:id')
  @HttpCode(200)
  async deleteGoal(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.wellness.deleteGoal(u.id, id);
    return { data: { deleted: true } };
  }

  // ── Habits ──
  @Get('habits')
  @ApiOperation({ summary: 'Active habits with streak + last-7-days status.' })
  async listHabits(@CurrentUser() u: AuthUser) { return { data: await this.wellness.listHabits(u.id) }; }

  @Post('habits')
  @HttpCode(201)
  async createHabit(@CurrentUser() u: AuthUser, @Body() dto: CreateHabitDtoIn) {
    return { data: await this.wellness.createHabit(u.id, dto) };
  }

  @Patch('habits/:id')
  async updateHabit(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateHabitDtoIn) {
    return { data: await this.wellness.updateHabit(u.id, id, dto) };
  }

  @Delete('habits/:id')
  @HttpCode(200)
  async deleteHabit(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.wellness.deleteHabit(u.id, id);
    return { data: { archived: true } };
  }

  @Post('habits/:id/toggle')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check/uncheck a habit for a day (default today).' })
  async toggleHabit(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ToggleHabitDtoIn) {
    return { data: await this.wellness.toggleHabit(u.id, id, dto.date) };
  }

  // ── Journal ──
  @Get('journal')
  async listJournal(@CurrentUser() u: AuthUser) { return { data: await this.wellness.listJournal(u.id) }; }

  @Post('journal')
  @HttpCode(201)
  async createJournal(@CurrentUser() u: AuthUser, @Body() dto: CreateJournalDtoIn) {
    return { data: await this.wellness.createJournal(u.id, dto) };
  }

  @Patch('journal/:id')
  async updateJournal(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateJournalDtoIn) {
    return { data: await this.wellness.updateJournal(u.id, id, dto) };
  }

  @Delete('journal/:id')
  @HttpCode(200)
  async deleteJournal(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.wellness.deleteJournal(u.id, id);
    return { data: { deleted: true } };
  }

  @Post('journal/:id/reflect')
  @HttpCode(200)
  @ApiOperation({ summary: 'Generate a supportive AI reflection on a journal entry.' })
  async reflectJournal(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.wellness.reflectJournal(u.id, id) };
  }

  // ── Timeline ──
  @Get('timeline')
  @ApiOperation({ summary: 'Unified wellness timeline (goals, journal, appointments, milestones, reports).' })
  async timeline(@CurrentUser() u: AuthUser) { return { data: await this.wellness.timeline(u.id) }; }
}
