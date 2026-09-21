import { Module } from '@nestjs/common';
import { AdminLeadsController, LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadOtpService } from './lead-otp.service';
import { LeadMessengerService } from './lead-messenger.service';
import { WasiService } from '../whatsapp/wasi.service';

@Module({
  controllers: [LeadsController, AdminLeadsController],
  providers: [LeadsService, LeadOtpService, LeadMessengerService, WasiService],
  exports: [LeadsService],
})
export class LeadsModule {}
