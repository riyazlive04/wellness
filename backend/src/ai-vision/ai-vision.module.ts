import { Module } from '@nestjs/common';
import { AiVisionController } from './ai-vision.controller';
import { AiVisionService } from './ai-vision.service';

@Module({
  controllers: [AiVisionController],
  providers: [AiVisionService],
})
export class AiVisionModule {}
