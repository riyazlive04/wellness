import { Body, Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { Audit } from '../admin/audit/audit.decorator';
import { ChangeStageDto, PhoneDto, CreateLeadDto, VerifyOtpDto } from './dto/create-lead.dto';
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

  /** Send a 6-digit verification code to the number on WhatsApp. */
  @Post('otp/send')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 6 } })
  @ApiOperation({ summary: 'Send a WhatsApp verification code before booking a call.' })
  async sendOtp(@Body() dto: PhoneDto) {
    return { data: await this.leadsService.sendOtp(dto.phone) };
  }

  /** Check the code the visitor typed. */
  @Post('otp/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 15 } })
  @ApiOperation({ summary: 'Verify the WhatsApp code.' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return { data: this.leadsService.verifyOtp(dto.phone, dto.code) };
  }
}

/**
 * Admin side of leads: moving a lead between sales stages. Goes through the
 * server (not a direct table update) so the stage's WhatsApp message is sent.
 */
@ApiTags('Admin · Leads')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/leads', version: '1' })
export class AdminLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move a lead to a sales stage; sends the stage WhatsApp message on a forward move.' })
  async changeStage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeStageDto) {
    return { data: await this.leadsService.changeStage(id, dto.status) };
  }

  @Delete(':id')
  @Audit({ action: 'lead.delete', resourceType: 'lead', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Permanently delete a lead.' })
  async deleteLead(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.leadsService.deleteLead(id) };
  }
}
