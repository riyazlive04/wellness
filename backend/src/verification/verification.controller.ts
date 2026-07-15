import { Body, Controller, ForbiddenException, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { VerificationService, type VerificationDoc } from './verification.service';

class SubmitVerificationDto {
  @IsOptional() @IsString() @MaxLength(200) legal_name?: string;
  @IsOptional() @IsString() @MaxLength(120) professional_title?: string;
  @IsOptional() @IsString() @MaxLength(500) qualifications?: string;
  @IsOptional() @IsString() @MaxLength(120) registration_number?: string;
  @IsOptional() @IsInt() @Min(0) @Max(80) experience_years?: number;
  @IsOptional() @IsString() @MaxLength(10) pan?: string;
  @IsOptional() @IsString() @MaxLength(15) gstin?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) documents?: VerificationDoc[];
}

class DocTicketDto {
  @IsString() @MaxLength(200) file_name!: string;
}

/**
 * Practitioner verification — owner side. The workspace owner submits their
 * professional + compliance details and supporting documents for SIRAH LIFE to
 * review. Owner-only (members/coaches don't manage the practice's verification).
 */
@ApiTags('Workspace · Verification')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/verification', version: '1' })
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Current verification status + submitted data for the caller\'s workspace.' })
  async get(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.verification.getForWorkspace(user.workspaceId) };
  }

  @Put()
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Submit (or resubmit) the practice for verification — resets status to pending.' })
  async submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitVerificationDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.verification.submit(user.workspaceId, user.id, dto) };
  }

  @Post('upload-ticket')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Signed upload URL for a supporting document (degree, registration cert, etc.).' })
  async uploadTicket(@CurrentUser() user: AuthUser, @Body() dto: DocTicketDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.verification.createDocUploadTicket(user.workspaceId, dto.file_name) };
  }
}
