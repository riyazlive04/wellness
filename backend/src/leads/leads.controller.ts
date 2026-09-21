import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('Public · Leads')
@Controller({ path: 'public/leads', version: '1' })
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Submit demo request from the landing page and trigger WhatsApp notification.' })
  async createLead(@Body() dto: CreateLeadDto) {
    const result = await this.leadsService.createLead(dto);
    return { data: result };
  }
}
