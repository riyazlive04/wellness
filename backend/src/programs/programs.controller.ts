import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { Audit } from '../admin/audit/audit.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ProgramsService } from './programs.service';

const TASK_TYPES = ['activity', 'nutrition', 'habit', 'task', 'checkin'];
const CADENCES = ['daily', 'weekly', 'once'];
const ACCENT_COLORS = ['violet', 'blue', 'emerald', 'amber', 'rose', 'indigo', 'teal', 'slate'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

class ChatMessageIn {
  @IsString() @MinLength(1) @MaxLength(4000) content!: string;
}

class CreateTemplateIn {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  // Preset categories (weight_management, lifestyle, …) or any custom label the
  // practice defines — free text, capped for sanity.
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsInt() @Min(1) @Max(730) durationWeeks?: number;
  @IsOptional() @IsIn(['weeks', 'days']) durationUnit?: string;
  @IsOptional() @IsArray() goals?: string[];
  @IsOptional() @IsIn(ACCENT_COLORS) accentColor?: string;
  // Rich details (program.md)
  @IsOptional() @IsString() @MaxLength(200) tagline?: string;
  @IsOptional() @IsString() @MaxLength(3_000_000) coverImageUrl?: string; // downscaled data-URL
  @IsOptional() @IsIn(DIFFICULTIES) difficulty?: string;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsBoolean() allowEnrollment?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(100000) maxEnrollments?: number;
  @IsOptional() @IsString() @MaxLength(5000) internalNotes?: string;
  @IsOptional() @IsObject() content?: Record<string, unknown>;
}
class UpdateTemplateIn extends CreateTemplateIn {
  @IsOptional() @IsString() declare name: string;
  @IsOptional() @IsIn(['draft', 'published', 'archived']) status?: string;
}
class TaskIn {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsIn(TASK_TYPES) type?: string;
  @IsOptional() @IsIn(CADENCES) cadence?: string;
  @IsOptional() @IsInt() @Min(1) @Max(104) weekNumber?: number;
  @IsOptional() @IsInt() @Min(0) @Max(6) dayOfWeek?: number;
  @IsOptional() @IsInt() sortOrder?: number;
}
class AssignIn {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) clientIds!: string[];
}
class StatusIn {
  @IsIn(['active', 'completed', 'paused', 'cancelled']) status!: string;
}

/**
 * Module 8 — owner/nutritionist Program Engine API. Workspace-scoped: templates,
 * the builder (tasks), assignment to clients, monitoring, and analytics.
 */
@ApiTags('Program Engine')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/programs', version: '1' })
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  // ── Templates ──
  @Get('templates')
  @WorkspaceRole('owner', 'nutritionist')
  async listTemplates(@CurrentUser() u: AuthUser) {
    return { data: await this.programs.listTemplates(this.programs.assertWorkspace(u.workspaceId)) };
  }

  @Post('templates')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(201)
  @Audit({ action: 'program.template.create', resourceType: 'program_template' })
  async createTemplate(@CurrentUser() u: AuthUser, @Body() dto: CreateTemplateIn) {
    return { data: await this.programs.createTemplate(this.programs.assertWorkspace(u.workspaceId), u.id, dto) };
  }

  @Get('templates/:id')
  @WorkspaceRole('owner', 'nutritionist')
  async getTemplate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.programs.getTemplate(this.programs.assertWorkspace(u.workspaceId), id) };
  }

  // ── Program group chat (owner/staff side) ──
  @Get('templates/:id/chat')
  @WorkspaceRole('owner', 'nutritionist', 'manager')
  @ApiOperation({ summary: "A program's group chat (shared with enrolled clients)." })
  async chatList(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.programs.chatListOwner(this.programs.assertWorkspace(u.workspaceId), id) };
  }

  @Post('templates/:id/chat')
  @WorkspaceRole('owner', 'nutritionist', 'manager')
  @HttpCode(201)
  @ApiOperation({ summary: 'Post to a program group chat as the practice.' })
  async chatSend(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ChatMessageIn) {
    return { data: await this.programs.chatSendOwner(this.programs.assertWorkspace(u.workspaceId), u.id, id, dto.content) };
  }

  @Patch('templates/:id')
  @WorkspaceRole('owner', 'nutritionist')
  async updateTemplate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateTemplateIn) {
    return { data: await this.programs.updateTemplate(this.programs.assertWorkspace(u.workspaceId), id, dto) };
  }

  @Delete('templates/:id')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  async deleteTemplate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.programs.deleteTemplate(this.programs.assertWorkspace(u.workspaceId), id);
    return { data: { deleted: true } };
  }

  // ── Builder: tasks ──
  @Post('templates/:id/tasks')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(201)
  async addTask(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: TaskIn) {
    return { data: await this.programs.addTask(this.programs.assertWorkspace(u.workspaceId), id, dto) };
  }

  @Patch('templates/:id/tasks/:taskId')
  @WorkspaceRole('owner', 'nutritionist')
  async updateTask(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('taskId') taskId: string, @Body() dto: TaskIn) {
    return { data: await this.programs.updateTask(this.programs.assertWorkspace(u.workspaceId), id, taskId, dto) };
  }

  @Delete('templates/:id/tasks/:taskId')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  async deleteTask(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('taskId') taskId: string) {
    await this.programs.deleteTask(this.programs.assertWorkspace(u.workspaceId), id, taskId);
    return { data: { deleted: true } };
  }

  // ── Assignment ──
  @Post('templates/:id/assign')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(201)
  @Audit({ action: 'program.assign', resourceType: 'program_template', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Assign a template to one or more clients (snapshots its tasks).' })
  async assign(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AssignIn) {
    return { data: await this.programs.assign(this.programs.assertWorkspace(u.workspaceId), u.id, id, dto.clientIds) };
  }

  @Get('assignments')
  @WorkspaceRole('owner', 'nutritionist')
  async listAssignments(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    return { data: await this.programs.listAssignments(this.programs.assertWorkspace(u.workspaceId), status) };
  }

  @Get('assignments/:id')
  @WorkspaceRole('owner', 'nutritionist')
  async assignmentDetail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.programs.assignmentDetail(this.programs.assertWorkspace(u.workspaceId), id) };
  }

  @Patch('assignments/:id/status')
  @WorkspaceRole('owner', 'nutritionist')
  async setStatus(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: StatusIn) {
    return { data: await this.programs.setAssignmentStatus(this.programs.assertWorkspace(u.workspaceId), id, dto.status) };
  }

  @Get('assignments/:id/recommend')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'AI recommendations to improve this client’s program adherence.' })
  async recommend(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.programs.recommend(this.programs.assertWorkspace(u.workspaceId), id) };
  }

  // ── Analytics ──
  @Get('analytics')
  @WorkspaceRole('owner', 'nutritionist')
  async analytics(@CurrentUser() u: AuthUser) {
    return { data: await this.programs.workspaceAnalytics(this.programs.assertWorkspace(u.workspaceId)) };
  }
}
