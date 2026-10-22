import { Audit } from './audit/audit.decorator';
import { Body, Controller, Get, HttpCode, Param, Post, Put, Delete, ParseUUIDPipe } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { ConnectionsService } from '../connections/connections.service';

class SetSenderDto {
  @IsIn(['platform', 'own'])
  sender!: 'platform' | 'own';
}

/**
 * Link a PRACTICE's WhatsApp number on their behalf.
 *
 * Practices cannot do this themselves: the gateway, the number and the
 * approved message templates are NUSI's to run, so the self-serve QR flow was
 * removed from their Settings. That left the team with no way to do it either
 * - the only admin WhatsApp screen links NUSI's own platform number, which is
 * a different instance for landing-page leads.
 *
 * These are thin wrappers over the same ConnectionsService methods the
 * practice-side endpoints used, so the two paths cannot drift: same instance
 * creation, same encryption, same status resolution.
 */
@ApiTags('Admin · Workspace WhatsApp')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/workspaces/:id/whatsapp', version: '1' })
export class AdminWorkspaceWhatsappController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  @ApiOperation({ summary: "Link state of this practice's WhatsApp (and a fresh QR while pending)." })
  async status(@Param('id', ParseUUIDPipe) id: string) {
    // whatsappStatus reports the instance; the sender choice lives beside it
    // and the card needs both to show which number is actually in use.
    const [state, sender] = await Promise.all([
      this.connections.whatsappStatus(id),
      this.connections.whatsappSender(id),
    ]);
    return { data: { ...state, sender } };
  }

  @Put('sender')
  @HttpCode(200)
  @Audit({ action: 'workspace.whatsapp.sender', resourceType: 'workspace', resourceIdParam: 'id' })
  @ApiOperation({ summary: "Choose whether this practice sends from NUSI's number or their own." })
  async setSender(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetSenderDto) {
    return { data: await this.connections.setWhatsappSender(id, dto.sender) };
  }

  @Post('connect')
  @HttpCode(200)
  @Audit({ action: 'workspace.whatsapp.link', resourceType: 'workspace', resourceIdParam: 'id' })
  @ApiOperation({ summary: "Start linking this practice's WhatsApp; returns a QR to scan." })
  async connect(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.connections.connectWhatsapp(id) };
  }

  @Delete()
  @Audit({ action: 'workspace.whatsapp.unlink', resourceType: 'workspace', resourceIdParam: 'id' })
  @ApiOperation({ summary: "Unlink this practice's WhatsApp number." })
  async disconnect(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.connections.disconnect(id, 'whatsapp') };
  }
}
