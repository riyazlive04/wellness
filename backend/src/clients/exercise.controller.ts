import {
  Body, Controller, Delete, ForbiddenException, Get, NotFoundException,
  Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsInt, IsISO8601, IsOptional, IsString, Matches,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { PrismaService } from '../database/prisma.service';
import { ClientsService } from './clients.service';
import { ExerciseService } from './exercise.service';

class PhotoRefDto {
  @IsString() @MaxLength(300) storage_key!: string;
  @IsOptional() @IsInt() @Min(0) bytes?: number;
}

class CreateExerciseDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) kind?: string;
  /** The client's local date. Defaults to today in the practice's timezone. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'performed_on must be YYYY-MM-DD.' })
  performed_on?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'performed_at must be HH:MM.' })
  performed_at?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) duration_min?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => PhotoRefDto)
  photos?: PhotoRefDto[];
}

class TicketDto {
  @IsString() @MaxLength(200) file_name!: string;
}

class FeedQuery {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() @MaxLength(40) kind?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

class DaysQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

/**
 * The client's own exercise log: upload a photo, record what they did, and
 * see their history. Every route resolves the caller's client row from their
 * token, so one client can never read or write another's entries.
 */
@ApiTags('Me · Exercise')
@ApiBearerAuth()
@Controller({ path: 'me/exercise', version: '1' })
export class MyExerciseController {
  constructor(
    private readonly exercise: ExerciseService,
    private readonly prisma: PrismaService,
  ) {}

  private async me(userId: string): Promise<string> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!row) throw new NotFoundException('No client profile linked to this user.');
    return row.id;
  }

  @Post('upload-ticket')
  @ApiOperation({ summary: 'A one-shot signed URL to upload one exercise photo to.' })
  async ticket(@CurrentUser() user: AuthUser, @Body() dto: TicketDto) {
    return { data: await this.exercise.uploadTicket(await this.me(user.id), dto.file_name) };
  }

  @Post()
  @ApiOperation({ summary: 'Record an exercise session, with any photos already uploaded.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateExerciseDto) {
    return { data: await this.exercise.create(await this.me(user.id), dto) };
  }

  @Get()
  @ApiOperation({ summary: 'My exercise history, newest first.' })
  async list(@CurrentUser() user: AuthUser, @Query() q: DaysQuery) {
    return { data: await this.exercise.forClient(await this.me(user.id), q.days ?? 60) };
  }

  @Get('days')
  @ApiOperation({ summary: 'Days I logged exercise, for the calendar.' })
  async days(@CurrentUser() user: AuthUser, @Query() q: DaysQuery) {
    return { data: await this.exercise.loggedDays(await this.me(user.id), q.days ?? 60) };
  }

  @Get('photos/:id/download')
  @ApiOperation({ summary: 'A signed URL for one of my exercise photos.' })
  async photo(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.exercise.signPhoto(id, { clientId: await this.me(user.id) }) };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one of my exercise entries and its photos.' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.exercise.remove(await this.me(user.id), id) };
  }
}

/**
 * The practice's view: what clients have been doing, and their photos.
 *
 * Also carries the progress-photo routes, which never existed — clients could
 * upload progress photos but nobody in the practice could see them.
 */
@ApiTags('Workspace · Exercise')
@ApiBearerAuth()
@WorkspaceRole('owner', 'nutritionist')
@Controller({ path: 'workspaces/me', version: '1' })
export class WorkspaceExerciseController {
  constructor(
    private readonly exercise: ExerciseService,
    private readonly clients: ClientsService,
  ) {}

  private ws(user: AuthUser): string {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return user.workspaceId;
  }

  @Get('exercise')
  @ApiOperation({ summary: 'Exercise submitted across the practice, newest first.' })
  async feed(@CurrentUser() user: AuthUser, @Query() q: FeedQuery) {
    const workspaceId = this.ws(user);
    if (q.clientId) await this.clients.assertClientInWorkspace(workspaceId, q.clientId);
    const [items, kinds] = await Promise.all([
      this.exercise.feed(workspaceId, q),
      this.exercise.kinds(workspaceId),
    ]);
    return { data: { items, kinds } };
  }

  @Get('clients/:clientId/exercise')
  @ApiOperation({ summary: "One client's exercise history." })
  async forClient(
    @CurrentUser() user: AuthUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() q: DaysQuery,
  ) {
    const workspaceId = this.ws(user);
    await this.clients.assertClientInWorkspace(workspaceId, clientId);
    const [items, days] = await Promise.all([
      this.exercise.forClient(clientId, q.days ?? 60),
      this.exercise.loggedDays(clientId, q.days ?? 60),
    ]);
    return { data: { items, days } };
  }

  @Get('exercise/photos/:id/download')
  @ApiOperation({ summary: 'A signed URL for one exercise photo.' })
  async photo(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.exercise.signPhoto(id, { workspaceId: this.ws(user) }) };
  }

  // ── Progress photos, which the practice could never see until now ──

  @Get('clients/:clientId/photos')
  @ApiOperation({ summary: "A client's progress photos." })
  async progressPhotos(
    @CurrentUser() user: AuthUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    const workspaceId = this.ws(user);
    await this.clients.assertClientInWorkspace(workspaceId, clientId);
    return { data: await this.clients.workspaceClientProgressPhotos(workspaceId, clientId, user.id) };
  }

  @Get('clients/:clientId/photos/:photoId/download')
  @ApiOperation({ summary: "A signed URL for one of a client's progress photos." })
  async progressPhoto(
    @CurrentUser() user: AuthUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    const workspaceId = this.ws(user);
    await this.clients.assertClientInWorkspace(workspaceId, clientId);
    return { data: await this.clients.signWorkspaceClientPhoto(workspaceId, clientId, photoId, user.id) };
  }
}
