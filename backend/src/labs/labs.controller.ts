import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional,
  IsString, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Audit } from '../admin/audit/audit.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { LabsService } from './labs.service';
import { LAB_MARKERS, LAB_PANELS } from './lab-markers';

class CreateLabDto {
  @IsOptional() @IsString() @MaxLength(80) markerCode?: string;
  @IsOptional() @IsString() @MaxLength(120) markerLabel?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() @MaxLength(80) valueText?: string;
  @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @IsOptional() @IsNumber() refLow?: number;
  @IsOptional() @IsNumber() refHigh?: number;
  @IsOptional() @IsString() @MaxLength(80) refText?: string;
  @IsDateString() takenOn!: string;
  @IsOptional() @IsString() @MaxLength(120) labName?: string;
  @IsOptional() @IsBoolean() fasting?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class UpdateLabDto {
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() @MaxLength(80) valueText?: string;
  @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @IsOptional() @IsNumber() refLow?: number;
  @IsOptional() @IsNumber() refHigh?: number;
  @IsOptional() @IsString() @MaxLength(80) refText?: string;
  @IsOptional() @IsDateString() takenOn?: string;
  @IsOptional() @IsString() @MaxLength(120) labName?: string;
  @IsOptional() @IsBoolean() fasting?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

/** One self-measured reading: which marker, and the number off the meter. */
class SelfReadingDto {
  @IsIn(['fbs', 'ppbs_meal1', 'ppbs_meal2'], {
    // The default message prints the raw allowlist at a client, who has no
    // idea what 'ppbs_meal1' is. The UI only ever sends these three, so
    // reaching this means something is wrong rather than mistyped.
    message: 'That is not a reading you can log yourself.',
  })
  markerCode!: string;

  @IsNumber({}, { message: 'Enter the number from your meter.' })
  value!: number;
}

class LogSelfReadingsDto {
  /** The day these readings are for, not when they were typed in. */
  @IsDateString() takenOn!: string;

  @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => SelfReadingDto)
  readings!: SelfReadingDto[];
}

/**
 * Structured lab results, workspace side.
 *
 * Read is open to the whole care team (a fitness coach seeing that HbA1c is
 * trending down is the point of a multidisciplinary practice); write requires
 * `clients.write`, because a lab value is clinical data and a wrong number here
 * propagates into every plan and report built on top of it.
 */
@ApiTags('Clinical - Lab results')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/clients/:clientId/labs', version: '1' })
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Get()
  @WorkspaceRole('owner', 'nutritionist', 'manager')
  @ApiOperation({ summary: "A client's lab history, grouped into per-marker trend series." })
  async history(@CurrentUser() u: AuthUser, @Param('clientId') clientId: string) {
    return { data: await this.labs.historyForWorkspace(this.labs.assertWorkspace(u.workspaceId), clientId) };
  }

  @Get('importable')
  @WorkspaceRole('owner', 'nutritionist', 'manager')
  @ApiOperation({ summary: 'Submitted assessments that contain readable lab values.' })
  async importable(@CurrentUser() u: AuthUser, @Param('clientId') clientId: string) {
    return { data: await this.labs.importableCards(this.labs.assertWorkspace(u.workspaceId), clientId) };
  }

  @Get('importable/:cardId/preview')
  @WorkspaceRole('owner', 'nutritionist', 'manager')
  @ApiOperation({ summary: 'Parse a submission without saving, to confirm before importing.' })
  async preview(
    @CurrentUser() u: AuthUser,
    @Param('clientId') clientId: string,
    @Param('cardId') cardId: string,
  ) {
    return { data: await this.labs.previewImport(this.labs.assertWorkspace(u.workspaceId), clientId, cardId) };
  }

  @Post('import/:cardId')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @HttpCode(201)
  @Audit({ action: 'labs.import', resourceType: 'client_lab_results' })
  @ApiOperation({ summary: 'Import a submitted lab report into structured results.' })
  async import(
    @CurrentUser() u: AuthUser,
    @Param('clientId') clientId: string,
    @Param('cardId') cardId: string,
  ) {
    return { data: await this.labs.importCard(this.labs.assertWorkspace(u.workspaceId), clientId, u.id, cardId) };
  }

  @Post()
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @HttpCode(201)
  @Audit({ action: 'labs.create', resourceType: 'client_lab_results' })
  @ApiOperation({ summary: 'Record a single lab result by hand.' })
  async create(
    @CurrentUser() u: AuthUser,
    @Param('clientId') clientId: string,
    @Body() dto: CreateLabDto,
  ) {
    return { data: await this.labs.create(this.labs.assertWorkspace(u.workspaceId), clientId, u.id, dto) };
  }

  @Patch(':id')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @Audit({ action: 'labs.update', resourceType: 'client_lab_results' })
  @ApiOperation({ summary: 'Correct a lab result — typically one the parser could not read.' })
  async update(
    @CurrentUser() u: AuthUser,
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLabDto,
  ) {
    return { data: await this.labs.update(this.labs.assertWorkspace(u.workspaceId), clientId, id, dto) };
  }

  @Delete(':id')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('clients.write')
  @Audit({ action: 'labs.delete', resourceType: 'client_lab_results' })
  @ApiOperation({ summary: 'Delete a lab result.' })
  async remove(
    @CurrentUser() u: AuthUser,
    @Param('clientId') clientId: string,
    @Param('id') id: string,
  ) {
    return { data: await this.labs.remove(this.labs.assertWorkspace(u.workspaceId), clientId, id) };
  }
}

/**
 * The marker catalogue, so the manual-entry form can offer a picker instead of
 * asking a practitioner to remember the exact spelling that will trend correctly.
 */
@ApiTags('Clinical - Lab results')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/lab-markers', version: '1' })
export class LabMarkersController {
  @Get()
  @WorkspaceRole('owner', 'nutritionist', 'manager')
  @ApiOperation({ summary: 'The lab marker catalogue, grouped by panel.' })
  list() {
    return {
      data: {
        panels: LAB_PANELS,
        markers: LAB_MARKERS.map((m) => ({
          code: m.code,
          label: m.label,
          panel: m.panel,
          unit: m.unit,
          fallbackRef: m.fallbackRef,
          higherIsWorse: m.higherIsWorse,
        })),
      },
    };
  }
}

/**
 * Client side — read-only for anything that came off a lab report: the
 * practice owns what a result says.
 *
 * The one exception is daily self-monitoring. A client with diabetes takes
 * their own fasting and post-meal sugar at home, and those readings are
 * theirs to record - nobody else is in the room. They are stored with
 * `source='self'` so a practitioner reading the trend can always tell a home
 * glucometer reading from a venous lab draw, and the write is restricted to
 * the glycaemic markers a meter actually measures.
 */
@ApiTags('Client portal - Lab results')
@ApiBearerAuth()
@Controller({ path: 'me/labs', version: '1' })
export class MyLabsController {
  constructor(private readonly labs: LabsService) {}

  @Get()
  @ApiOperation({ summary: 'My lab results, grouped into trend series.' })
  async mine(@CurrentUser() u: AuthUser) {
    return { data: await this.labs.myHistory(u.id) };
  }

  @Post('self')
  @ApiOperation({ summary: "Log my own blood sugar readings for one day (fasting and post-meal)." })
  async logSelf(@CurrentUser() u: AuthUser, @Body() dto: LogSelfReadingsDto) {
    return {
      data: await this.labs.logSelfForUser(
        u.id,
        dto.takenOn,
        (dto.readings ?? []).map((r) => ({ markerCode: r.markerCode, value: r.value })),
      ),
    };
  }
}
