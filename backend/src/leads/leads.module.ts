import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadOtpService } from './lead-otp.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, LeadOtpService],
  exports: [LeadsService],
})
export class LeadsModule {}
