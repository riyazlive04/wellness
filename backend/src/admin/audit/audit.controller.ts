import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SuperAdmin } from '../../auth/decorators/super-admin.decorator';
import { AuditService } from './audit.service';

class ListAuditQueryDto {
  /** Filter by action prefix, e.g. 'workspace.' to see all workspace events. */
  @IsOptional() @IsString() actionPrefix?: string;

  @IsOptional() @IsUUID() actorId?: string;

  @IsOptional() @IsString() resourceType?: string;

  @IsOptional() @IsUUID() resourceId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)          offset?: number;
}

@ApiTags('Admin · Audit')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/audit', version: '1' })
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries with optional filters.' })
  async list(@Query() q: ListAuditQueryDto) {
    return { data: await this.audit.list(q) };
  }
}
