import { Module } from '@nestjs/common';
import { AdminLeadsController, LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadOtpService } from './lead-otp.service';

@Module({
  controllers: [LeadsController, AdminLeadsController],
  providers: [LeadsService, LeadOtpService],
  exports: [LeadsService],
})
export class LeadsModule {}
