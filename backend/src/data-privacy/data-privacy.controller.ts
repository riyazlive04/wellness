import {
  Body, Controller, Get, HttpCode, Patch, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { DataPrivacyService, DataRequestType } from './data-privacy.service';

class UpdateRetentionDto {
  @IsOptional() @IsInt() @Min(1) @Max(600) client_months?: number;
  @IsOptional() @IsInt() @Min(1) @Max(50) messages_years?: number;
  @IsOptional() @IsInt() @Min(1) @Max(3650) backups_days?: number;
}

class CreateDataRequestDto {
  @IsEmail() target_email!: string;
  @IsIn(['export', 'erasure']) type!: DataRequestType;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

/**
 * Settings → Data & privacy. All endpoints resolve the caller's primary
 * workspace and are owner-only (super_admin / org-admin bypass via RolesGuard).
 */
@ApiTags('Workspace · Data & privacy')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/data', version: '1' })
export class DataPrivacyController {
  constructor(
    private readonly dataPrivacy: DataPrivacyService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Post('export')
  @HttpCode(200)
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Generate a full export of this workspace\'s data.' })
  async export(@CurrentUser() user: AuthUser) {
    const ws = await this.workspaces.getForUser(user.id);
    return { data: await this.dataPrivacy.exportWorkspace(ws.id, ws.name) };
  }

  @Get('retention')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Read this workspace\'s retention policy.' })
  async getRetention(@CurrentUser() user: AuthUser) {
    const ws = await this.workspaces.getForUser(user.id);
    return { data: await this.dataPrivacy.getRetention(ws.id) };
  }

  @Patch('retention')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Update this workspace\'s retention policy.' })
  async updateRetention(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateRetentionDto,
  ) {
    const ws = await this.workspaces.getForUser(user.id);
    return { data: await this.dataPrivacy.updateRetention(ws.id, dto) };
  }

  @Get('requests')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'List client data export / erasure requests.' })
  async listRequests(@CurrentUser() user: AuthUser) {
    const ws = await this.workspaces.getForUser(user.id);
    return { data: await this.dataPrivacy.listDataRequests(ws.id) };
  }

  @Post('requests')
  @HttpCode(201)
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'File a client data export / erasure request.' })
  async createRequest(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDataRequestDto,
  ) {
    const ws = await this.workspaces.getForUser(user.id);
    return {
      data: await this.dataPrivacy.createDataRequest(ws.id, {
        targetEmail: dto.target_email,
        type: dto.type,
        reason: dto.reason ?? null,
        requestedBy: user.id,
        requestedByEmail: user.email ?? null,
      }),
    };
  }
}
