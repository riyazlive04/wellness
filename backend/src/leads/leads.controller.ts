import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { Audit } from '../admin/audit/audit.decorator';
import {
  ChangeStageDto,
  CreateLeadDto,
  EmailDto,
  LeadProgressDto,
  PhoneDto,
  PurposeDto,
  NameDto,
  VerifyEmailOtpDto,
  VerifyOtpDto,
} from './dto/create-lead.dto';
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

  /** Free demo-call slots the landing form can offer. */
  @Get('slots')
  @Public()
  @Throttle({ medium: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'List the demo-call slots still open.' })
  async slots() {
    return { data: await this.leadsService.openCallSlots() };
  }

  /** Is the "purpose of the call" a real reason? Checked as the visitor types. */
  @Post('purpose/check')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'AI check that the purpose of the call is a genuine reason.' })
  async checkPurpose(@Body() dto: PurposeDto) {
    return { data: await this.leadsService.checkPurpose(dto.purpose) };
  }

  /** Is this a real person's name? Checked in the welcome popup and the form. */
  @Post('name/check')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: "AI check that a name is a real person's name." })
  async checkName(@Body() dto: NameDto) {
    return { data: await this.leadsService.checkName(dto.name) };
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

  /** Save the form so far for a verified number that hasn't booked yet. */
  @Post('progress')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: "Keep a verified visitor who hasn't booked yet, for follow-up." })
  async saveProgress(@Body() dto: LeadProgressDto) {
    return { data: await this.leadsService.saveProgress(dto) };
  }

  /** Send a 6-digit verification code to the email address. */
  @Post('otp/email/send')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 6 } })
  @ApiOperation({ summary: 'Send an email verification code before booking a call.' })
  async sendEmailOtp(@Body() dto: EmailDto) {
    return { data: await this.leadsService.sendEmailOtp(dto.email) };
  }

  /** Check the email code the visitor typed. */
  @Post('otp/email/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 15 } })
  @ApiOperation({ summary: 'Verify the email code.' })
  verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    return { data: this.leadsService.verifyEmailOtp(dto.email, dto.code) };
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

  @Get(':id/stage-preview')
  @ApiOperation({ summary: 'What moving a lead to a stage would send them (shown before the admin confirms).' })
  async stagePreview(@Param('id', ParseUUIDPipe) id: string, @Query('status') status: string) {
    return { data: await this.leadsService.previewStage(id, status ?? '') };
  }

  @Patch(':id/status')
  @Audit({ action: 'lead.stage', resourceType: 'lead', resourceIdParam: 'id' })
  @ApiOperation({ summary: "Move a lead to a sales stage; sends the stage's message only when notify isn't false." })
  async changeStage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeStageDto) {
    return { data: await this.leadsService.changeStage(id, dto.status, dto.notify ?? true) };
  }

  @Delete(':id')
  @Audit({ action: 'lead.delete', resourceType: 'lead', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Permanently delete a lead.' })
  async deleteLead(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.leadsService.deleteLead(id) };
  }
}
