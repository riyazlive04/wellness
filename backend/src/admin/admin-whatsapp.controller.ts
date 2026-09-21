import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { WhatsappService } from '../whatsapp/whatsapp.service';

/**
 * NUSI's own WhatsApp number (the platform instance that sends landing-page
 * lead confirmations). Platform-admin only: lets the team see whether it is
 * linked and fetch a QR to link it, without touching the server.
 */
@ApiTags('Admin · WhatsApp')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/whatsapp/platform', version: '1' })
export class AdminWhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get()
  @ApiOperation({ summary: "Link status of NUSI's own WhatsApp instance." })
  async status() {
    return { data: await this.whatsapp.platformStatus() };
  }

  @Post('qr')
  @HttpCode(200)
  @ApiOperation({ summary: "Start NUSI's WhatsApp session and return a QR code to scan." })
  async qr() {
    return { data: await this.whatsapp.platformQr() };
  }
}
