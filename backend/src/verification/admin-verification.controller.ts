import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { Audit } from '../admin/audit/audit.decorator';
import { VerificationService } from './verification.service';

class DecisionDto {
  @IsIn(['verified', 'rejected']) decision!: 'verified' | 'rejected';
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

/**
 * Practitioner verification — review side. NUSI super admins see the
 * queue of submissions and mark each verified or rejected (with a reason).
 */
@ApiTags('Admin · Verification')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/verifications', version: '1' })
export class AdminVerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  @ApiOperation({ summary: 'List verification submissions (optionally filter by status).' })
  async list(@Query('status') status?: string) {
    return { data: await this.verification.list(status) };
  }

  @Get(':workspaceId')
  @ApiOperation({ summary: 'One workspace\'s verification submission.' })
  async get(@Param('workspaceId') workspaceId: string) {
    return { data: await this.verification.getForWorkspace(workspaceId) };
  }

  /**
   * Audited because it hands out a signed URL to someone's KYC documents (PAN,
   * GSTIN, practice certificates). Reads generally aren't logged, but this one
   * releases identity documents, so "who looked at this practitioner's PAN"
   * needs an answer.
   */
  @Get(':workspaceId/documents/:index/download')
  @Audit({
    action: 'verification.document.download',
    resourceType: 'workspace_verification',
    resourceIdParam: 'workspaceId',
  })
  @ApiOperation({ summary: 'Signed download URL for a submitted document.' })
  async signDoc(@Param('workspaceId') workspaceId: string, @Param('index') index: string) {
    const i = Number(index);
    return { data: await this.verification.signDocument(workspaceId, Number.isFinite(i) ? i : -1) };
  }

  @Post(':workspaceId/decision')
  // resourceIdParam was missing, so every decision row landed with a null
  // resource_id — the log recorded THAT someone approved a practitioner, but
  // never which one.
  @Audit({
    action: 'verification.decision',
    resourceType: 'workspace_verification',
    resourceIdParam: 'workspaceId',
  })
  @ApiOperation({ summary: 'Approve or reject a workspace verification.' })
  async decide(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: DecisionDto,
  ) {
    return { data: await this.verification.decide(workspaceId, user.id, dto.decision, dto.notes) };
  }
}
