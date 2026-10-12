import { Module } from '@nestjs/common';
import { VideoKeysController } from './video-keys.controller';
import { VideoKeysService } from './video-keys.service';

/** A practice's own Daily.co key for video calls (Settings → Video calls). */
@Module({
  controllers: [VideoKeysController],
  providers: [VideoKeysService],
  exports: [VideoKeysService],
})
export class VideoKeysModule {}
