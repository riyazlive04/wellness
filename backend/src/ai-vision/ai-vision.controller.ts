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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { AiVisionService, type AnalyzeResult } from './ai-vision.service';

const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB - phone photos can be hefty

@ApiTags('AI Vision')
@ApiBearerAuth()
@Controller({ path: 'vision', version: '1' })
export class AiVisionController {
  private readonly logger = new Logger(AiVisionController.name);

  constructor(private readonly vision: AiVisionService) {}

  /**
   * Analyse a plate photo: returns identified foods routed through the
   * deterministic Nutrition Engine. Every macro value cites an IFCT 2017 /
   * USDA-FDC row via the audit_id returned per item. Items that cannot be
   * resolved are flagged `resolved=false` for manual review — never hallucinated.
   */
  @Post('analyze')
  @HttpCode(200)
  @ApiOperation({ summary: 'Detect foods + calculate deterministic nutrition from a plate photo.' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async analyze(
    @CurrentUser() user: AuthUser,
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
    return this.vision.analyze(file.buffer, mime, {
      actor_user_id: user.id,
      workspace_id: user.workspaceId ?? undefined,
    });
  }
}
