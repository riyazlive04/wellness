import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { PrismaService } from '../database/prisma.service';
import { Audit } from './audit/audit.decorator';

class UpdateConfigDto {
  @IsOptional() @IsInt() @Min(0) @Max(365) trial_days?: number;
  @IsOptional() @IsArray() plans?: unknown[];
  @IsOptional() @IsObject() feature_flags?: Record<string, unknown>;
  @IsOptional() @IsObject() ai_quotas?: Record<string, unknown>;
}

@ApiTags('Admin · Config')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/config', version: '1' })
export class AdminConfigController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Read the single platform_config row.' })
  async get() {
    const row = await this.prisma.platform_config.findUnique({ where: { id: 1 } });
    return { data: row };
  }

  @Patch()
  @Audit({ action: 'config.update', resourceType: 'config' })
  @ApiOperation({ summary: 'Update the platform_config row (partial fields).' })
  async update(@Body() dto: UpdateConfigDto, @CurrentUser() user: AuthUser) {
    const row = await this.prisma.platform_config.update({
      where: { id: 1 },
      data: {
        trial_days: dto.trial_days,
        plans:         dto.plans ? JSON.parse(JSON.stringify(dto.plans)) : undefined,
        feature_flags: dto.feature_flags ? JSON.parse(JSON.stringify(dto.feature_flags)) : undefined,
        ai_quotas:     dto.ai_quotas ? JSON.parse(JSON.stringify(dto.ai_quotas)) : undefined,
        updated_by: user.id,
      },
    });
    return { data: row };
  }
}
