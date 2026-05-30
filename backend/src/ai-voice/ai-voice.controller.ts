import {
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { AiVoiceService, type ConverseResult } from './ai-voice.service';

// Audio MIME types Gemini accepts. Keep narrow.
const ALLOWED_AUDIO_MIMES = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
];

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

@ApiTags('AI Voice')
@Controller({ path: 'voice', version: '1' })
export class AiVoiceController {
  private readonly logger = new Logger(AiVoiceController.name);

  constructor(private readonly voice: AiVoiceService) {}

  /**
   * Single-shot voice loop: client posts an audio blob, server returns
   * { userTranscript, aiResponse, intent } in one round trip.
   * Auth disabled for now — re-add JwtAuthGuard once the auth context is wired.
   */
  @Post('converse')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Send an audio clip, get back transcript + AI reply + intent.' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async converse(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_BYTES })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ): Promise<ConverseResult> {
    // FileInterceptor sometimes reports a synthetic mime; normalise.
    const mime = (file.mimetype || '').toLowerCase().split(';')[0];
    const isAllowed = ALLOWED_AUDIO_MIMES.some((m) => m.split(';')[0] === mime);
    if (!isAllowed) {
      throw new BadRequestException(
        `Unsupported audio type "${file.mimetype}". Send webm/ogg/wav/mp3/mp4.`,
      );
    }

    this.logger.log(`converse: ${file.size} bytes, ${file.mimetype}`);
    return this.voice.converse(file.buffer, mime);
  }
}
