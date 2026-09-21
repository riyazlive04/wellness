import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CheckWhatsappDto, CreateLeadDto, VerifyOtpDto } from './dto/create-lead.dto';
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
  async sendOtp(@Body() dto: CheckWhatsappDto) {
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

  /**
   * Live "is this number on WhatsApp?" check for the form's phone field.
   * Tightly throttled: a public number-lookup is exactly what a scraper wants.
   */
  @Post('check-whatsapp')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Check whether a 10-digit Indian mobile has WhatsApp (null = unknown).' })
  async checkWhatsapp(@Body() dto: CheckWhatsappDto) {
    return { data: await this.leadsService.checkWhatsapp(dto.phone) };
  }
}
