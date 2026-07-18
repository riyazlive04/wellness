import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { UsageService } from './usage.service';

@ApiTags('Admin · AI usage')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/usage', version: '1' })
export class AdminUsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('snapshot')
  @ApiOperation({ summary: 'KPI block: total / 24h calls + cost, success rate, unique workspaces.' })
  async snapshot() {
    return { data: await this.usage.snapshot() };
  }

  @Get('by-service')
  @ApiOperation({ summary: 'Last-30d aggregate by service (chat/voice/vision).' })
  async byService() {
    return { data: await this.usage.byService() };
  }

  @Get('by-model')
  @ApiOperation({ summary: 'Last-30d aggregate by provider + model - which AI costs what.' })
  async byModel() {
    return { data: await this.usage.byModel() };
  }

  @Get('top-workspaces')
  @ApiOperation({ summary: 'Top workspaces by call count this month, with quota status.' })
  async topWorkspaces(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 15;
    return { data: await this.usage.topWorkspaces(Number.isFinite(n) ? n : 15) };
  }

  @Get('trend')
  @ApiOperation({ summary: 'Daily usage trend (default 30 days).' })
  async trend(@Query('days') days?: string) {
    const d = days ? Number(days) : 30;
    return { data: await this.usage.trend(Number.isFinite(d) ? d : 30) };
  }

  @Get('anomalies')
  @ApiOperation({ summary: 'Workspaces with >=5× call spike in last 24h vs prior day.' })
  async anomalies() {
    return { data: await this.usage.anomalies() };
  }
}