import { Global, Module } from '@nestjs/common';
import { AiKeysController } from './ai-keys.controller';
import { AiKeysService } from './ai-keys.service';
import { AiRuntimeService } from './ai-runtime.service';

/** Global so every AI feature can resolve the practice's key without module wiring. */
@Global()
@Module({
  controllers: [AiKeysController],
  providers: [AiKeysService, AiRuntimeService],
  exports: [AiKeysService, AiRuntimeService],
})
export class AiKeysModule {}
