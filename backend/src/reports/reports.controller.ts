import {
  Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ReportsService, type ReportKind } from './reports.service';

const KINDS: ReportKind[] = [
  'client_health', 'client_monthly', 'program_performance', 'workspace_digest', 'billing_gst',
];

class RecordReportBody {
  @IsIn(KINDS) kind!: ReportKind;
  @IsString() @MaxLength(120) templateName!: string;
  @IsOptional() @IsString() @MaxLength(160) targetLabel?: string;
  @IsOptional() @IsUUID() targetId?: string;
  @IsOptional() @IsString() @MaxLength(60) periodLabel?: string;
  @IsOptional() @IsInt() @Min(0) pageCount?: number;
  @IsOptional() @IsInt() @Min(0) sizeKb?: number;
}

/**
 * Owner "PDFs, summaries & audits" page. PDFs render client-side (jsPDF); the
 * backend supplies the real numbers (`/data`) and keeps the generation history
 * (`list`/`stats`/`record`/`delete`). Owner + nutritionist only.
 */
@ApiTags('Reports')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/reports', version: '1' })
@WorkspaceRole('owner', 'nutritionist')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private ws(u: AuthUser): string {
    if (!u.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return u.workspaceId;
  }

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    return { data: await this.reports.list(this.ws(u)) };
  }

  @Get('stats')
  async stats(@CurrentUser() u: AuthUser) {
    return { data: await this.reports.stats(this.ws(u)) };
  }

  @Get('data')
  @ApiOperation({ summary: 'Assemble the real numbers a report needs, ready to render to PDF.' })
  async data(
    @CurrentUser() u: AuthUser,
    @Query('kind') kind: ReportKind,
    @Query('targetId') targetId?: string,
  ) {
    return { data: await this.reports.getData(this.ws(u), kind, targetId) };
  }

  @Post()
  @ApiOperation({ summary: 'Record a generated report in the workspace history.' })
  async record(@CurrentUser() u: AuthUser, @Body() body: RecordReportBody) {
    return { data: await this.reports.record(this.ws(u), { id: u.id, email: u.email }, body) };
  }

  @Delete(':id')
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.reports.remove(this.ws(u), id) };
  }
}
