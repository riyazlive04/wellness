import { Module } from '@nestjs/common';
import { AdminLeadsController, LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadRemindersService } from './lead-reminders.service';
import { LeadInputCheckService } from './lead-input-check.service';
import { LeadOtpService } from './lead-otp.service';
import { LeadMessengerService } from './lead-messenger.service';
import { WasiService } from '../whatsapp/wasi.service';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  controllers: [LeadsController, AdminLeadsController],
  providers: [LeadsService, LeadRemindersService, LeadInputCheckService, LeadOtpService, LeadMessengerService, WasiService, GoogleCalendarService],
  exports: [LeadsService],
})
export class LeadsModule {}
