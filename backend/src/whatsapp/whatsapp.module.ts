import { Global, Module } from '@nestjs/common';
import { WasiService } from './wasi.service';
import { WhatsappService } from './whatsapp.service';

/**
 * Global so any module can inject these without re-importing.
 *
 * Two senders, deliberately: WhatsappService drives NUSI's own number through
 * Evolution and can send free text, but only while a phone stays linked.
 * WasiService is the official Meta API — always up, no linked handset — but
 * every conversation it starts must use a template Meta has approved.
 */
@Global()
@Module({
  providers: [WhatsappService, WasiService],
  exports: [WhatsappService, WasiService],
})
export class WhatsappModule {}
