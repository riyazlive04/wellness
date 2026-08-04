import { Global, Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

/** Global so any module can inject WhatsappService without re-importing. */
@Global()
@Module({
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
