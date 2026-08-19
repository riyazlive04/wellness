import {
  BadRequestException,
  Body,
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
import { AiVisionService } from './ai-vision.service';
import { withLegacyFields, type LegacyCompatibleAnalysis } from './legacy-compat';
import type { AnalyzeHints } from './plate-analysis.types';

const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB - phone photos can be hefty

const PORTIONS = ['small', 'medium', 'large'] as const;

/**
 * Multipart text fields arrive as strings, so coerce and bound them here rather
 * than trusting the client. Anything unrecognised is dropped, not rejected -
 * these are optional refinements, never required to analyse a photo.
 */
function readHints(body: Record<string, unknown>): AnalyzeHints {
  const str = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
  const portion = typeof body.portion === 'string' ? body.portion.toLowerCase() : undefined;
  return {
    hint: str(body.hint, 300),
    correction: str(body.correction, 200),
    portion: (PORTIONS as readonly string[]).includes(portion ?? '')
      ? (portion as AnalyzeHints['portion'])
      : undefined,
    scale_ref: body.scale_ref === 'true' || body.scale_ref === true,
  };
}

@ApiTags('AI Vision')
@ApiBearerAuth()
@Controller({ path: 'vision', version: '1' })
export class AiVisionController {
  private readonly logger = new Logger(AiVisionController.name);

  constructor(private readonly vision: AiVisionService) {}

  /**
   * Analyse a plate photo into a dish-level nutrition breakdown.
   *
   * ⚠️ The macro values are ESTIMATED BY THE MODEL, not looked up in IFCT /
   * USDA and not computed by the nutrition engine — there is no audit_id to
   * re-derive them from, and a second call on the same photo can differ. The
   * response carries `provenance.nutrition_source: 'ai_estimate'` so callers
   * can label them honestly; `totals.calories_range` carries the model's own
   * uncertainty band and should be shown alongside the headline number.
   */
  @Post('analyze')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Identify a dish and estimate its nutrition from a plate photo (AI estimate, not a database lookup).',
    description:
      'Optional multipart text fields refine the identification: hint, portion (small|medium|large), scale_ref (true when a spoon/hand/card is in frame), and correction (the user telling you what the dish actually is after a wrong guess). Portion measurably shifts the gram estimate (-31% / +40%), so surface it in the capture UI.',
  })
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
    @Body() body: Record<string, unknown> = {},
  ): Promise<LegacyCompatibleAnalysis> {
    const mime = (file.mimetype || '').toLowerCase().split(';')[0];
    if (!ALLOWED_IMAGE_MIMES.includes(mime)) {
      throw new BadRequestException(
        `Unsupported image type "${file.mimetype}". Send JPEG/PNG/WEBP/HEIC.`,
      );
    }
    this.logger.log(`analyze: ${file.size} bytes, ${file.mimetype}`);
    const analysis = await this.vision.analyze(
      file.buffer,
      mime,
      { actor_user_id: user.id, workspace_id: user.workspaceId ?? undefined },
      readHints(body),
    );
    // Emit the old field names alongside the new ones so an un-updated mobile
    // bundle keeps working during the OTA rollout window. See legacy-compat.ts
    // for when this can be removed.
    return withLegacyFields(analysis);
  }
}
