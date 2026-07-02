import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AssessmentService } from './assessment.service';

class RecordMeasurementDto {
  @IsOptional() @IsNumber() @Min(20) @Max(400) weight_kg?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) arm_inches?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(120) chest_inches?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(120) waist_inches?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(120) hip_inches?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(120) thigh_inches?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

/** Client self-assessment — computed metrics + their own measurement history. */
@ApiTags('Assessment')
@ApiBearerAuth()
@Controller({ path: 'me/assessment', version: '1' })
export class MyAssessmentController {
  constructor(private readonly assessment: AssessmentService) {}

  @Get()
  @ApiOperation({ summary: 'BMI, IBW, BMR, TDEE, WHR, body-fat computed from the latest data.' })
  async mine(@CurrentUser() user: AuthUser) {
    return { data: await this.assessment.forUser(user.id) };
  }

  @Get('measurements')
  @ApiOperation({ summary: 'My measurement history (newest first).' })
  async list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return { data: await this.assessment.listForUser(user.id, limit ? Number(limit) : 30) };
  }

  @Post('measurements')
  @HttpCode(201)
  @ApiOperation({ summary: 'Record a new measurement; returns the recomputed assessment.' })
  async record(@CurrentUser() user: AuthUser, @Body() dto: RecordMeasurementDto) {
    return { data: await this.assessment.recordForUser(user.id, dto) };
  }
}

/** Owner / nutritionist view of a specific client's assessment. */
@ApiTags('Workspace · Assessment')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/clients/:clientId/assessment', version: '1' })
export class ClientAssessmentController {
  constructor(private readonly assessment: AssessmentService) {}

  @Get()
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: "A client's computed assessment." })
  async get(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.assessment.forClient(user.workspaceId, clientId) };
  }

  @Get('measurements')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: "A client's measurement history." })
  async list(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string, @Query('limit') limit?: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.assessment.listForClient(user.workspaceId, clientId, limit ? Number(limit) : 30) };
  }

  @Post('measurements')
  @HttpCode(201)
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: "Record a measurement for a client during a consult." })
  async record(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string, @Body() dto: RecordMeasurementDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.assessment.recordForClient(user.workspaceId, clientId, dto) };
  }
}
