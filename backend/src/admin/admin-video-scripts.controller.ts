import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Audit } from './audit/audit.decorator';

const STATUSES = ['draft', 'ready', 'produced', 'retired'] as const;
type Status = (typeof STATUSES)[number];

/**
 * Prisma's Json input type rejects an array of class instances — a validated
 * DTO has no string index signature. Flatten to plain objects before writing,
 * which also drops anything class-transformer attached to the instance.
 */
function toJsonLines(lines?: ScriptLineDto[]): Prisma.InputJsonValue {
  return (lines ?? []).map((l) => ({ n: l.n, vo: l.vo, on_screen: l.on_screen }));
}

/** One row of the shot table. */
class ScriptLineDto {
  @IsInt() @Min(1) @Max(999) n!: number;
  /** What is said. Empty is allowed — a silent beat is a real shot. */
  @IsString() @MaxLength(2000) vo!: string;
  @IsString() @MaxLength(2000) on_screen!: string;
}

class CreateVideoScriptDto {
  @IsInt() @Min(1) @Max(9999)        number!: number;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsInt() @Min(1) @Max(99)          bucket!: number;
  @IsString() @MinLength(1) @MaxLength(200) bucket_title!: string;
  @IsInt() @Min(5) @Max(3600)        duration_seconds!: number;

  @IsOptional() @IsString() @MaxLength(120)  kind?: string;
  @IsOptional() @IsString() @MaxLength(300)  avatar?: string;
  @IsOptional() @IsString() @MaxLength(300)  hook_type?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsIn(STATUSES)              status?: Status;

  // 400 lines is far beyond the longest real script (the 180s walkthrough is
  // 32); the cap is here so a malformed import cannot write an unbounded doc.
  @IsOptional() @IsArray() @ArrayMaxSize(400)
  @ValidateNested({ each: true }) @Type(() => ScriptLineDto)
  lines?: ScriptLineDto[];
}

/** Every field optional — a PATCH may carry only `status`, or only one line. */
class UpdateVideoScriptDto {
  @IsOptional() @IsInt() @Min(1) @Max(9999)        number?: number;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsInt() @Min(1) @Max(99)          bucket?: number;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) bucket_title?: string;
  @IsOptional() @IsInt() @Min(5) @Max(3600)        duration_seconds?: number;

  @IsOptional() @IsString() @MaxLength(120)  kind?: string;
  @IsOptional() @IsString() @MaxLength(300)  avatar?: string;
  @IsOptional() @IsString() @MaxLength(300)  hook_type?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsIn(STATUSES)              status?: Status;

  @IsOptional() @IsArray() @ArrayMaxSize(400)
  @ValidateNested({ each: true }) @Type(() => ScriptLineDto)
  lines?: ScriptLineDto[];
}

class ImportVideoScriptsDto {
  @IsArray() @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => CreateVideoScriptDto)
  scripts!: CreateVideoScriptDto[];
}

/**
 * The marketing video-script library.
 *
 * Platform content, like `leads` — there is no workspace_id and no tenant
 * scoping, because these scripts belong to Sirah Digital rather than to any
 * practice. @SuperAdmin() on the controller is the gate; RLS (deny-all) sits
 * underneath as the second layer.
 */
@ApiTags('admin/video-scripts')
@ApiBearerAuth()
@SuperAdmin()
@Controller('admin/video-scripts')
export class AdminVideoScriptsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List video scripts (optionally filtered)' })
  async list(
    @Query('bucket') bucket?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const bucketNum = bucket ? Number.parseInt(bucket, 10) : undefined;

    const items = await this.prisma.video_scripts.findMany({
      where: {
        ...(Number.isInteger(bucketNum) ? { bucket: bucketNum } : {}),
        ...(status && (STATUSES as readonly string[]).includes(status)
          ? { status }
          : {}),
        // Title/avatar/hook only. Searching inside `lines` needs a jsonb scan,
        // and the client already has every script in memory — it filters the
        // VO text there, instantly, without a round trip.
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' as const } },
                { avatar: { contains: q, mode: 'insensitive' as const } },
                { hook_type: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { number: 'asc' },
    });

    return { items };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One video script' })
  async one(@Param('id', ParseUUIDPipe) id: string) {
    const script = await this.prisma.video_scripts.findUnique({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    return script;
  }

  @Post()
  @Audit({ action: 'video_script.create', resourceType: 'video_script' })
  @ApiOperation({ summary: 'Create a video script' })
  async create(@Body() dto: CreateVideoScriptDto) {
    await this.assertNumberFree(dto.number);
    return this.prisma.video_scripts.create({
      data: { ...dto, lines: toJsonLines(dto.lines) },
    });
  }

  @Patch(':id')
  @Audit({
    action: 'video_script.update',
    resourceType: 'video_script',
    resourceIdParam: 'id',
  })
  @ApiOperation({ summary: 'Update a video script' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVideoScriptDto,
  ) {
    const existing = await this.prisma.video_scripts.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Script not found');

    if (dto.number !== undefined && dto.number !== existing.number) {
      await this.assertNumberFree(dto.number);
    }

    const { lines, ...rest } = dto;
    return this.prisma.video_scripts.update({
      where: { id },
      // Only touch `lines` when the caller actually sent it — a PATCH that
      // carries just `status` must not blank the script.
      data: lines === undefined ? rest : { ...rest, lines: toJsonLines(lines) },
    });
  }

  @Delete(':id')
  @Audit({
    action: 'video_script.delete',
    resourceType: 'video_script',
    resourceIdParam: 'id',
  })
  @ApiOperation({ summary: 'Delete a video script' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const existing = await this.prisma.video_scripts.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Script not found');

    await this.prisma.video_scripts.delete({ where: { id } });
    return { deleted: true };
  }

  @Post('import')
  @Audit({ action: 'video_script.import', resourceType: 'video_script' })
  @ApiOperation({
    summary: 'Seed or re-sync scripts from the markdown originals',
    description:
      'Upserts on `number`, so running it twice is idempotent and never ' +
      'duplicates the library. Scripts already in the table that are absent ' +
      'from the payload are left alone — import never deletes.',
  })
  async import(@Body() dto: ImportVideoScriptsDto) {
    // Sequential rather than Promise.all: 50 upserts is fast, and a serial
    // loop keeps the failure report pointing at one identifiable script.
    let created = 0;
    let updated = 0;

    for (const s of dto.scripts) {
      const existing = await this.prisma.video_scripts.findUnique({
        where: { number: s.number },
      });
      const data = { ...s, lines: toJsonLines(s.lines) };

      if (existing) {
        await this.prisma.video_scripts.update({ where: { number: s.number }, data });
        updated += 1;
      } else {
        await this.prisma.video_scripts.create({ data });
        created += 1;
      }
    }

    return { created, updated, total: dto.scripts.length };
  }

  /** Numbers are how operators refer to scripts, so collisions are a real bug. */
  private async assertNumberFree(number: number) {
    const clash = await this.prisma.video_scripts.findUnique({ where: { number } });
    if (clash) {
      throw new ConflictException(
        `Script ${number} already exists ("${clash.title}"). Pick another number.`,
      );
    }
  }
}
