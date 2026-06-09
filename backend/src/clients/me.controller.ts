import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { ClientsService } from './clients.service';

class LogHabitDto {
  /** Defaults to today (YYYY-MM-DD). Frontend can backfill yesterday with this. */
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) water_ml?: number;
  @IsOptional() @IsInt() @Min(0) @Max(24)    sleep_hours?: number;
  @IsOptional() @IsInt() @Min(0) @Max(600)   exercise_minutes?: number;
  @IsOptional() weight_kg?: number;
}

class SendMessageDto {
  @IsString() @MaxLength(4000) content!: string;
}

class UpdateProfileDto {
  @IsOptional() @IsInt() @Min(10) @Max(120) age?: number;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() @MaxLength(500) goals?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(1000) allergies?: string;
  @IsOptional() @IsString() @MaxLength(1000) medical_conditions?: string;
  @IsOptional() @IsString() @MaxLength(1000) food_preferences?: string;
  @IsOptional() @IsIn(['sedentary', 'light', 'moderate', 'active', 'very_active'])
  activity_level?: string;
  @IsOptional() @IsInt() @Min(50) @Max(250) height_cm?: number;
}

class BookAppointmentDto {
  @IsString() scheduled_at!: string;
  @IsOptional() @IsInt() @Min(15) @Max(240) duration_minutes?: number;
  @IsIn(['consultation', 'follow_up', 'check_in', 'assessment', 'group_session'])
  kind!: 'consultation' | 'follow_up' | 'check_in' | 'assessment' | 'group_session';
  @IsOptional() @IsIn(['video', 'phone', 'in_person'])
  mode?: 'video' | 'phone' | 'in_person';
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

class CancelAppointmentDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

class PushSubscribeDto {
  @IsString() endpoint!: string;
  @IsString() p256dh!: string;
  @IsString() auth!: string;
  @IsOptional() @IsString() @MaxLength(500) user_agent?: string;
}

class PushUnsubscribeDto {
  @IsString() endpoint!: string;
}

/**
 * Client-portal endpoints. Anyone with a valid JWT can call them — service
 * will return 404 if no clients row links to this user_id.
 */
@ApiTags('Me · Client portal')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    private readonly clients: ClientsService,
    private readonly config: ConfigService,
  ) {}

  // ────────────────────────────────────────────────────────────────────
  // Reads
  // ────────────────────────────────────────────────────────────────────

  @Get('profile')
  @ApiOperation({ summary: 'Caller\'s client profile (resolved by user_id → clients.user_id).' })
  async profile(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myProfile(user.id) };
  }

  @Get('meals')
  @ApiOperation({ summary: 'Caller\'s meal logs over the last N days (default 7).' })
  async meals(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const d = days ? Number(days) : 7;
    return { data: await this.clients.myMeals(user.id, Number.isFinite(d) ? d : 7) };
  }

  @Get('messages')
  @ApiOperation({ summary: 'Caller\'s message thread with their nutritionist + system messages.' })
  async messages(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50;
    return { data: await this.clients.myMessages(user.id, Number.isFinite(n) ? n : 50) };
  }

  @Get('program')
  @ApiOperation({ summary: 'Caller\'s currently-published weekly plan, if any.' })
  async program(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myProgram(user.id) };
  }

  @Get('wellness/snapshot')
  @ApiOperation({ summary: 'Score + today\'s headline stats for the dashboard hero.' })
  async wellnessSnapshot(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myWellnessSnapshot(user.id) };
  }

  @Get('habits')
  @ApiOperation({ summary: 'Last N days of habit logs (water, sleep, exercise, weight). Default 14.' })
  async habits(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const d = days ? Number(days) : 14;
    return { data: await this.clients.myHabits(user.id, Number.isFinite(d) ? d : 14) };
  }

  @Get('achievements')
  @ApiOperation({ summary: 'All achievements + the caller\'s progress on each.' })
  async achievements(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myAchievements(user.id) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Mutations
  // ────────────────────────────────────────────────────────────────────

  @Post('habits')
  @ApiOperation({ summary: 'Upsert today\'s habit log (or any past date via `date`).' })
  async logHabit(@CurrentUser() user: AuthUser, @Body() body: LogHabitDto) {
    return { data: await this.clients.upsertHabit(user.id, body) };
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a message to the caller\'s nutritionist.' })
  async sendMessage(@CurrentUser() user: AuthUser, @Body() body: SendMessageDto) {
    return { data: await this.clients.sendMessage(user.id, body.content) };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update writable wellness-profile fields (allergies, goals, etc).' })
  async updateProfile(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto) {
    return { data: await this.clients.updateMyProfile(user.id, body) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Appointments
  // ────────────────────────────────────────────────────────────────────

  @Get('appointments')
  @ApiOperation({ summary: 'All appointments for the caller (upcoming + history, newest first).' })
  async listAppointments(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myAppointments(user.id) };
  }

  @Post('appointments')
  @ApiOperation({ summary: 'Book a new appointment. scheduled_at must be a future ISO timestamp.' })
  async bookAppointment(@CurrentUser() user: AuthUser, @Body() body: BookAppointmentDto) {
    return { data: await this.clients.bookAppointment(user.id, body) };
  }

  @Delete('appointments/:id')
  @ApiOperation({ summary: 'Cancel an appointment (caller must own it, must still be scheduled).' })
  async cancelAppointment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CancelAppointmentDto,
  ) {
    return { data: await this.clients.cancelAppointment(user.id, id, body.reason) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Push notifications
  //
  // The VAPID public key is needed by the browser to subscribe. We expose
  // it via a public-ish endpoint (still JWT-guarded for now since this
  // controller is) so the client doesn't have to ship it in the env.
  // ────────────────────────────────────────────────────────────────────

  @Get('push/config')
  @ApiOperation({ summary: 'Returns the VAPID public key for browser subscription.' })
  pushConfig() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
    return { data: { vapidPublicKey: publicKey, enabled: !!publicKey } };
  }

  @Post('push/subscribe')
  @ApiOperation({ summary: 'Save a push subscription for the caller\'s device.' })
  async pushSubscribe(@CurrentUser() user: AuthUser, @Body() body: PushSubscribeDto) {
    return { data: await this.clients.savePushSubscription(user.id, body) };
  }

  @Post('push/unsubscribe')
  @ApiOperation({ summary: 'Remove a push subscription (when the user opts out or the endpoint goes stale).' })
  async pushUnsubscribe(@CurrentUser() user: AuthUser, @Body() body: PushUnsubscribeDto) {
    return { data: await this.clients.removePushSubscription(user.id, body.endpoint) };
  }
}