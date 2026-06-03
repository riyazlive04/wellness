import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { Audit } from '../admin/audit/audit.decorator';
import { ComplianceService } from './compliance.service';
import {
  CreateDeletionRequestDto,
  UpdateDeletionRequestDto,
} from './dto/create-request.dto';
import { ListDeletionRequestsQuery } from './dto/list-requests.query';

@ApiTags('Admin · Compliance')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/compliance', version: '1' })
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('snapshot')
  @ApiOperation({ summary: 'KPI block: pending / in-review / completed / overdue counts.' })
  async snapshot() {
    return { data: await this.compliance.snapshot() };
  }

  @Get('deletion-requests')
  @ApiOperation({ summary: 'List deletion requests with status filter + pagination.' })
  async list(@Query() q: ListDeletionRequestsQuery) {
    return { data: await this.compliance.listDeletionRequests(q) };
  }

  @Post('deletion-requests')
  @HttpCode(201)
  @Audit({ action: 'compliance.deletion_request.create', resourceType: 'deletion_request' })
  @ApiOperation({ summary: 'File a new deletion request (DPDP right-to-erasure).' })
  async create(
    @CurrentUser() actor: AuthUser,
    @Body() body: CreateDeletionRequestDto,
  ) {
    return {
      data: await this.compliance.createRequest({
        targetEmail: body.targetEmail,
        targetUserId: body.targetUserId ?? null,
        workspaceId: body.workspaceId ?? null,
        channel: body.channel,
        reason: body.reason ?? null,
        requestedBy: actor.id,
        requestedByEmail: actor.email ?? null,
      }),
    };
  }

  @Patch('deletion-requests/:id')
  @Audit({ action: 'compliance.deletion_request.update', resourceType: 'deletion_request', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Update status of a deletion request (in_review / completed / rejected).' })
  async update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateDeletionRequestDto,
  ) {
    return {
      data: await this.compliance.setStatus(id, body.status, actor.id, body.notes ?? null),
    };
  }

  @Get('export/:userId')
  @Audit({ action: 'compliance.dsar_export', resourceType: 'user', resourceIdParam: 'userId' })
  @ApiOperation({ summary: 'DSAR export — every row across the platform belonging to a user.' })
  async dsar(@Param('userId') userId: string) {
    return { data: await this.compliance.dsarExport(userId) };
  }
}