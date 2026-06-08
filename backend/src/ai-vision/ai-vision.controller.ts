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
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiVisionService, type AnalyzeResult } from './ai-vision.service';

const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB — phone photos can be hefty

@ApiTags('AI Vision')
@ApiBearerAuth()
@Controller({ path: 'vision', version: '1' })
export class AiVisionController {
  private readonly logger = new Logger(AiVisionController.name);

  constructor(private readonly vision: AiVisionService) {}

  /**
   * Analyse a plate photo: returns detected food items with portion + macros.
   * Requires a workspace JWT so the call attributes to the right tenant in
   * ai_usage_events (the metering middleware reads workspace_id from
   * TenantContext, which is only populated when JwtStrategy.validate() runs).
   */
  @Post('analyze')
  @HttpCode(200)
  @ApiOperation({ summary: 'Detect foods + estimate nutrition from a plate photo.' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async analyze(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_BYTES })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ): Promise<AnalyzeResult> {
    const mime = (file.mimetype || '').toLowerCase().split(';')[0];
    if (!ALLOWED_IMAGE_MIMES.includes(mime)) {
      throw new BadRequestException(
        `Unsupported image type "${file.mimetype}". Send JPEG/PNG/WEBP/HEIC.`,
      );
    }
    this.logger.log(`analyze: ${file.size} bytes, ${file.mimetype}`);
    return this.vision.analyze(file.buffer, mime);
  }
}
