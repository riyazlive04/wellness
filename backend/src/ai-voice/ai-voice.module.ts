import { Module } from '@nestjs/common';
import { NutritionEngineModule } from '../nutrition-engine/nutrition-engine.module';
import { AiVoiceController } from './ai-voice.controller';
import { AiVoiceService } from './ai-voice.service';

@Module({
  imports: [NutritionEngineModule],
  controllers: [AiVoiceController],
  providers: [AiVoiceService],
})
export class AiVoiceModule {}
