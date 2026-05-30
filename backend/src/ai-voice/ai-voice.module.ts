import { Module } from '@nestjs/common';
import { AiVoiceController } from './ai-voice.controller';
import { AiVoiceService } from './ai-voice.service';

@Module({
  controllers: [AiVoiceController],
  providers: [AiVoiceService],
})
export class AiVoiceModule {}
