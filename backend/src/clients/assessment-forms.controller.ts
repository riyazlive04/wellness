import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ClientsService } from './clients.service';
import type { QuestionType, TemplateQuestion } from './assessment-templates';

const QUESTION_TYPES: QuestionType[] = ['section', 'text', 'scale', 'number', 'yesno', 'choice', 'multi'];

class FormQuestionDto {
  @IsString() @MaxLength(80) id!: string;
  @IsString() @MaxLength(300) question!: string;
  @IsIn(QUESTION_TYPES) type!: QuestionType;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(120, { each: true }) options?: string[];
  @IsOptional() @IsInt() @Min(2) max?: number;
  @IsOptional() @IsBoolean() required?: boolean;
}

class CreateFormDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => FormQuestionDto)
  questions!: FormQuestionDto[];
}

/**
 * Workspace-authored custom assessment forms. Owners/nutritionists build
 * reusable form definitions here; they're then assignable to clients via
 * POST /workspaces/me/clients/:clientId/assessments { templateId }.
 */
@ApiTags('Workspace · Assessment forms')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/assessment-forms', version: '1' })
export class AssessmentFormsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List the workspace\'s custom assessment forms.' })
  async list(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.listAssessmentForms(user.workspaceId) };
  }

  @Post()
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a custom assessment form.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateFormDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return {
      data: await this.clients.createAssessmentForm(user.workspaceId, user.id, {
        name: dto.name,
        description: dto.description,
        questions: dto.questions as TemplateQuestion[],
      }),
    };
  }

  @Delete(':id')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Archive a custom assessment form.' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.deleteAssessmentForm(user.workspaceId, id) };
  }
}
