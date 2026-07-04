import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { ClientsService } from './clients.service';

const KINDS = ['consultation', 'follow_up', 'check_in', 'assessment', 'group_session'] as const;
const MODES = ['video', 'phone', 'in_person'] as const;
const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;

class CreateAppointmentDto {
  @IsString() client_id!: string;
  @IsString() scheduled_at!: string;
  @IsOptional() @IsInt() @Min(15) @Max(240) duration_minutes?: number;
  @IsIn(KINDS as unknown as string[]) kind!: (typeof KINDS)[number];
  @IsOptional() @IsIn(MODES as unknown as string[]) mode?: (typeof MODES)[number];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
}

class UpdateAppointmentDto {
  @IsOptional() @IsString() scheduled_at?: string;
  @IsOptional() @IsInt() @Min(15) @Max(240) duration_minutes?: number;
  @IsOptional() @IsIn(KINDS as unknown as string[]) kind?: (typeof KINDS)[number];
  @IsOptional() @IsIn(MODES as unknown as string[]) mode?: (typeof MODES)[number];
  @IsOptional() @IsIn(STATUSES as unknown as string[]) status?: (typeof STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
}

class CancelAppointmentDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

/** Workspace-admin (owner / nutritionist) appointment management — real, DB-backed.
 *  Plan-gated: Appointments is a Pro & Elite feature. */
@ApiTags('Workspace · Appointments')
@ApiBearerAuth()
@RequireFeature('appointments')
@Controller({ path: 'workspaces/me/appointments', version: '1' })
export class WorkspaceAppointmentsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List the workspace\'s appointments, optionally within a [from, to] window.' })
  async list(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.listWorkspaceAppointments(user.workspaceId, from, to) };
  }

  @Get(':id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Fetch a single workspace appointment (detail + meeting room).' })
  async getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.getWorkspaceAppointment(user.workspaceId, id) };
  }

  @Get(':id/meeting')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Join config for the embedded video room (domain/room/token).' })
  async meeting(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.workspaceMeetingConfig(user.workspaceId, id, user) };
  }

  @Post()
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(201)
  @ApiOperation({ summary: 'Schedule an appointment for a client (auto-creates a video room when mode=video).' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.createWorkspaceAppointment(user.workspaceId, user.id, dto) };
  }

  @Patch(':id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Reschedule / edit / mark complete or no-show.' })
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.updateWorkspaceAppointment(user.workspaceId, id, dto) };
  }

  @Delete(':id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Cancel an appointment (notifies the client).' })
  async cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CancelAppointmentDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.clients.cancelWorkspaceAppointment(user.workspaceId, user.id, id, dto.reason) };
  }
}
