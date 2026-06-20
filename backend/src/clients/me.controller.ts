import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
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
  @IsOptional() @IsString() @MaxLength(4000) content?: string;
  @IsOptional() @IsObject() attachment?: { url: string; type: string; name?: string; size?: number };
  @IsOptional() @IsString() replyTo?: string;
}
class ReactDto {
  @IsString() @MaxLength(8) emoji!: string;
}
class EditMessageDto {
  @IsString() @MaxLength(4000) content!: string;
}
class PinDto {
  @IsBoolean() pinned!: boolean;
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
  /** Downscaled data-URI or hosted URL for the client's profile photo. */
  @IsOptional() @IsString() @MaxLength(1_500_000) avatar_url?: string;
}

class CompleteOnboardingDto {
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
  @IsOptional() initial_weight_kg?: number;
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

class CreatePostDto {
  @IsString() @MaxLength(1000) content!: string;
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsString() @MaxLength(150) title?: string;
}

class LogMeasurementDto {
  @IsOptional() arm_inches?: number;
  @IsOptional() chest_inches?: number;
  @IsOptional() waist_inches?: number;
  @IsOptional() hip_inches?: number;
  @IsOptional() thigh_inches?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsString() recorded_at?: string;
}

class SubmitAssessmentDto {
  responses!: Record<string, unknown>;
}

class LogMoodDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) mood?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) energy?: number;
  @IsOptional() @IsString() @MaxLength(500) mood_notes?: string;
  @IsOptional() @IsString() date?: string;
}

class LogCycleEventDto {
  @IsIn(['period_start', 'period_end', 'ovulation', 'pms', 'cramps', 'spotting'])
  event_type!: 'period_start' | 'period_end' | 'ovulation' | 'pms' | 'cramps' | 'spotting';
  @IsOptional() @IsString() event_date?: string;
  @IsOptional() @IsInt() @Min(0) @Max(3) flow_level?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

class PhotoUploadTicketDto {
  @IsString() @MaxLength(200) file_name!: string;
}

class FileUploadTicketDto {
  @IsString() @MaxLength(200) file_name!: string;
}

class BannerQuotesDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  quotes!: string[];
}

class AddFileDto {
  @IsString() storage_key!: string;
  @IsString() @MaxLength(255) file_name!: string;
  @IsOptional() @IsString() @MaxLength(150) file_type?: string;
  @IsOptional() @IsInt() @Min(0) file_size?: number;
}

class AddPhotoDto {
  @IsString() storage_key!: string;
  @IsOptional() @IsIn(['front', 'side', 'back']) angle?: 'front' | 'side' | 'back';
  @IsOptional() weight_kg?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsString() taken_at?: string;
}

class LogSymptomDto {
  @IsString() @MaxLength(80) symptom!: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) severity?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsString() @MaxLength(80) suspected_trigger?: string;
  @IsOptional() @IsString() occurred_at?: string;
}

class UpsertSupplementDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(80) dosage?: string;
  @IsOptional() schedule?: string[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

class LogSupplementTakenDto {
  @IsOptional() @IsString() @MaxLength(20) slot?: string;
}

class CreateCommentDto {
  @IsString() @MaxLength(500) content!: string;
}

class ReactionDto {
  @IsOptional() @IsIn(['like', 'love', 'celebrate'])
  reaction?: 'like' | 'love' | 'celebrate';
}

class MemberStatusDto {
  @IsIn(['active', 'muted']) status!: 'active' | 'muted';
}

class MemberRoleDto {
  @IsIn(['member', 'moderator']) role!: 'member' | 'moderator';
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

  @Get('nutritionist')
  @ApiOperation({ summary: 'The caller\'s nutritionist/practice profile (name, logo, tagline).' })
  async nutritionist(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myNutritionist(user.id) };
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
    return { data: await this.clients.sendMessage(user.id, {
      content: body.content, attachment: body.attachment, replyTo: body.replyTo,
    }) };
  }

  @Post('messages/read')
  @ApiOperation({ summary: 'Mark the nutritionist\'s messages as read (drives their read receipts).' })
  async markMessagesRead(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.markMyThreadRead(user.id) };
  }

  @Post('messages/:messageId/react')
  @ApiOperation({ summary: 'Toggle a reaction emoji on a message in my thread.' })
  async reactMessage(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string, @Body() dto: ReactDto) {
    return { data: await this.clients.reactClient(user.id, messageId, dto.emoji) };
  }

  @Patch('messages/:messageId')
  @ApiOperation({ summary: 'Edit one of my own messages.' })
  async editMessage(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string, @Body() dto: EditMessageDto) {
    return { data: await this.clients.editClient(user.id, messageId, dto.content) };
  }

  @Delete('messages/:messageId')
  @ApiOperation({ summary: 'Delete a message — scope=me (hide for you) or everyone (default).' })
  async deleteMessage(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string, @Query('scope') scope?: string) {
    return { data: await this.clients.deleteClient(user.id, messageId, scope === 'me' ? 'me' : 'everyone') };
  }

  @Post('messages/:messageId/pin')
  @ApiOperation({ summary: 'Pin / unpin a message in my thread.' })
  async pinMessage(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string, @Body() dto: PinDto) {
    return { data: await this.clients.pinClient(user.id, messageId, dto.pinned) };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update writable wellness-profile fields (allergies, goals, etc).' })
  async updateProfile(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto) {
    return { data: await this.clients.updateMyProfile(user.id, body) };
  }

  @Put('banner-quotes')
  @ApiOperation({ summary: 'Replace the client\'s rotating Today-banner quotes.' })
  async setBannerQuotes(@CurrentUser() user: AuthUser, @Body() body: BannerQuotesDto) {
    return { data: await this.clients.setMyBannerQuotes(user.id, body.quotes) };
  }

  @Post('presence')
  @ApiOperation({ summary: 'Heartbeat — stamp the client as active now (Instagram-style presence).' })
  async presence(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.recordPresence(user.id) };
  }

  @Post('onboarding/complete')
  @ApiOperation({ summary: 'Complete the post-invite wellness wizard. Sets onboarded_at and saves wizard fields atomically.' })
  async completeOnboarding(@CurrentUser() user: AuthUser, @Body() body: CompleteOnboardingDto) {
    return { data: await this.clients.completeOnboarding(user.id, body) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Appointments
  // ────────────────────────────────────────────────────────────────────

  @Get('appointments')
  @ApiOperation({ summary: 'All appointments for the caller (upcoming + history, newest first).' })
  async listAppointments(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myAppointments(user.id) };
  }

  @Get('appointments/:id')
  @ApiOperation({ summary: 'Fetch one of the caller\'s appointments (used by the meeting room page).' })
  async getAppointment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.getMyAppointment(user.id, id) };
  }

  @Get('appointments/:id/meeting')
  @ApiOperation({ summary: 'Join config for the embedded video room (domain/room/token).' })
  async meetingConfig(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.myMeetingConfig(user.id, id, user) };
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

  // ────────────────────────────────────────────────────────────────────
  // Community — groups + posts + reactions + comments
  // ────────────────────────────────────────────────────────────────────

  @Get('community/groups')
  @ApiOperation({ summary: 'Public groups + ones the caller is a member of (joined first).' })
  async listGroups(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.listGroups(user.id) };
  }

  @Post('community/groups/:id/join')
  @ApiOperation({ summary: 'Join a community group. Idempotent — calling twice is fine.' })
  async joinGroup(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.joinGroup(user.id, id) };
  }

  @Post('community/groups/:id/leave')
  @ApiOperation({ summary: 'Leave a community group (member_count decrements).' })
  async leaveGroup(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.leaveGroup(user.id, id) };
  }

  @Get('community/posts')
  @ApiOperation({ summary: 'Feed of posts. With ?groupId, scoped to that group; otherwise global public feed.' })
  async listPosts(
    @CurrentUser() user: AuthUser,
    @Query('groupId') groupId?: string,
    @Query('limit')   limit?: string,
  ) {
    const lim = limit ? Number(limit) : 30;
    return {
      data: await this.clients.listPosts(user.id, {
        groupId,
        limit: Number.isFinite(lim) ? lim : 30,
      }),
    };
  }

  @Post('community/posts')
  @ApiOperation({ summary: 'Create a post. Optional groupId scopes it to a group, otherwise global.' })
  async createPost(@CurrentUser() user: AuthUser, @Body() body: CreatePostDto) {
    return { data: await this.clients.createPost(user.id, body) };
  }

  @Post('community/posts/:id/react')
  @ApiOperation({ summary: 'Toggle a reaction on a post. Returns { reacted, likesCount }.' })
  async reactToPost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ReactionDto,
  ) {
    return { data: await this.clients.toggleReaction(user.id, id, body.reaction ?? 'like') };
  }

  @Get('community/posts/:id/comments')
  @ApiOperation({ summary: 'Comments on a post, oldest first.' })
  async listComments(@Param('id') id: string, @Query('limit') limit?: string) {
    const lim = limit ? Number(limit) : 50;
    return { data: await this.clients.listComments(id, Number.isFinite(lim) ? lim : 50) };
  }

  @Post('community/posts/:id/comments')
  @ApiOperation({ summary: 'Add a comment to a post.' })
  async createComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateCommentDto,
  ) {
    return { data: await this.clients.createComment(user.id, id, body.content) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Moderation — pin/delete/kick/mute. Backend enforces role; the
  // frontend hides these tools but every endpoint re-checks server-side.
  // ────────────────────────────────────────────────────────────────────

  @Post('community/posts/:id/pin')
  @ApiOperation({ summary: 'Toggle pinned state on a post. Owner/moderator of the group only.' })
  async pinPost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.togglePinPost(user.id, id) };
  }

  @Delete('community/posts/:id')
  @ApiOperation({ summary: 'Delete a post. Author, or owner/moderator of the post\'s group.' })
  async deletePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.deletePost(user.id, id) };
  }

  @Delete('community/comments/:id')
  @ApiOperation({ summary: 'Delete a comment. Author, or owner/moderator of the parent post\'s group.' })
  async deleteComment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.deleteComment(user.id, id) };
  }

  @Get('community/groups/:id/members')
  @ApiOperation({ summary: 'List members of a group with their roles. Members only.' })
  async listGroupMembers(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.listGroupMembers(user.id, id) };
  }

  @Get('community/groups/:id/leaderboard')
  @ApiOperation({ summary: 'Challenge leaderboard. 400 if the group is not a challenge.' })
  async groupLeaderboard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.groupLeaderboard(user.id, id) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Body measurements
  // ────────────────────────────────────────────────────────────────────

  @Get('measurements')
  @ApiOperation({ summary: 'Caller\'s body measurement history (newest first).' })
  async listMeasurements(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 30;
    return { data: await this.clients.myMeasurements(user.id, Number.isFinite(n) ? n : 30) };
  }

  @Post('measurements')
  @ApiOperation({ summary: 'Log a new measurement entry. At least one field required.' })
  async logMeasurement(@CurrentUser() user: AuthUser, @Body() body: LogMeasurementDto) {
    return { data: await this.clients.logMeasurement(user.id, body) };
  }

  @Delete('measurements/:id')
  @ApiOperation({ summary: 'Delete a measurement entry. Caller must own it.' })
  async deleteMeasurement(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.deleteMeasurement(user.id, id) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Assessment cards
  // ────────────────────────────────────────────────────────────────────

  @Get('assessments')
  @ApiOperation({ summary: 'Sent assessment cards waiting for the client to fill in.' })
  async listAssessments(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myAssessmentCards(user.id) };
  }

  @Post('assessments/:id/responses')
  @ApiOperation({ summary: 'Submit answers on an assessment card. Stored in generated_content.client_responses.' })
  async submitAssessment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SubmitAssessmentDto,
  ) {
    return { data: await this.clients.submitAssessmentResponse(user.id, id, body.responses) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Recipes
  // ────────────────────────────────────────────────────────────────────

  @Get('recipes')
  @ApiOperation({ summary: 'Recipe library. Optional ?q= search by name.' })
  async listRecipes(@Query('q') q?: string, @Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50;
    return { data: await this.clients.listRecipes({ q, limit: Number.isFinite(n) ? n : 50 }) };
  }

  @Get('recipes/:id')
  @ApiOperation({ summary: 'Recipe detail with full ingredients list + instructions.' })
  async getRecipe(@Param('id') id: string) {
    return { data: await this.clients.getRecipe(id) };
  }

  // ────────────────────────────────────────────────────────────────────
  // File vault
  // ────────────────────────────────────────────────────────────────────

  @Get('files')
  @ApiOperation({ summary: 'Files shared with the caller by their nutritionist.' })
  async listFiles(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myFiles(user.id) };
  }

  @Get('files/:id/download')
  @ApiOperation({ summary: 'Returns a signed (10 minute) download URL for a file the caller owns.' })
  async signFile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.signFileDownload(user.id, id) };
  }

  @Post('files/upload-ticket')
  @ApiOperation({ summary: 'Signed upload URL so the client can PUT a file (report etc.) directly to storage.' })
  async fileUploadTicket(@CurrentUser() user: AuthUser, @Body() body: FileUploadTicketDto) {
    return { data: await this.clients.createFileUploadTicket(user.id, body.file_name) };
  }

  @Post('files')
  @ApiOperation({ summary: 'Record a file the client just uploaded (visible to their nutritionist).' })
  async addFile(@CurrentUser() user: AuthUser, @Body() body: AddFileDto) {
    return { data: await this.clients.addMyFile(user.id, body) };
  }

  @Delete('files/:id')
  @ApiOperation({ summary: 'Delete one of the client\'s own uploaded files.' })
  async deleteFile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.deleteMyFile(user.id, id) };
  }

  @Post('community/groups/:id/members/:clientId/kick')
  @ApiOperation({ summary: 'Remove a member from a group. Owner kicks anyone; moderator kicks regular members.' })
  async kickMember(
    @CurrentUser() user: AuthUser,
    @Param('id') groupId: string,
    @Param('clientId') clientId: string,
  ) {
    return { data: await this.clients.kickMember(user.id, groupId, clientId) };
  }

  @Post('community/groups/:id/members/:clientId/status')
  @ApiOperation({ summary: 'Set a member\'s status (active/muted). Owner or moderator.' })
  async setMemberStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') groupId: string,
    @Param('clientId') clientId: string,
    @Body() body: MemberStatusDto,
  ) {
    return { data: await this.clients.setMemberStatus(user.id, groupId, clientId, body.status) };
  }

  @Post('community/groups/:id/members/:clientId/role')
  @ApiOperation({ summary: 'Promote / demote a member (member ⇄ moderator). Owner only.' })
  async setMemberRole(
    @CurrentUser() user: AuthUser,
    @Param('id') groupId: string,
    @Param('clientId') clientId: string,
    @Body() body: MemberRoleDto,
  ) {
    return { data: await this.clients.setMemberRole(user.id, groupId, clientId, body.role) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Wave 1 — engagement + India features
  // ────────────────────────────────────────────────────────────────────

  @Get('mood')
  async moodHistory(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const n = days ? Number(days) : 30;
    return { data: await this.clients.myMoodHistory(user.id, Number.isFinite(n) ? n : 30) };
  }
  @Post('mood')
  async logMood(@CurrentUser() user: AuthUser, @Body() body: LogMoodDto) {
    return { data: await this.clients.logMood(user.id, body) };
  }

  @Get('cycle')
  async cycleEvents(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const n = days ? Number(days) : 180;
    return { data: await this.clients.myCycleEvents(user.id, Number.isFinite(n) ? n : 180) };
  }
  @Get('cycle/prediction')
  async cyclePrediction(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.cyclePrediction(user.id) };
  }
  @Post('cycle')
  async logCycleEvent(@CurrentUser() user: AuthUser, @Body() body: LogCycleEventDto) {
    return { data: await this.clients.logCycleEvent(user.id, body) };
  }
  @Delete('cycle/:id')
  async deleteCycleEvent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.deleteCycleEvent(user.id, id) };
  }

  @Get('photos')
  async progressPhotos(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myProgressPhotos(user.id) };
  }
  @Post('photos/upload-ticket')
  async photoUploadTicket(@CurrentUser() user: AuthUser, @Body() body: PhotoUploadTicketDto) {
    return { data: await this.clients.createPhotoUploadTicket(user.id, body.file_name) };
  }
  @Post('photos')
  async addPhoto(@CurrentUser() user: AuthUser, @Body() body: AddPhotoDto) {
    return { data: await this.clients.addProgressPhoto(user.id, body) };
  }
  @Get('photos/:id/download')
  async signPhoto(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.signProgressPhoto(user.id, id) };
  }
  @Delete('photos/:id')
  async deletePhoto(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.deleteProgressPhoto(user.id, id) };
  }

  @Get('symptoms')
  async symptoms(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const n = days ? Number(days) : 60;
    return { data: await this.clients.mySymptoms(user.id, Number.isFinite(n) ? n : 60) };
  }
  @Post('symptoms')
  async logSymptom(@CurrentUser() user: AuthUser, @Body() body: LogSymptomDto) {
    return { data: await this.clients.logSymptom(user.id, body) };
  }
  @Delete('symptoms/:id')
  async deleteSymptom(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.deleteSymptom(user.id, id) };
  }

  @Get('milestones')
  async milestones(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myMilestones(user.id) };
  }
  @Post('milestones/:id/celebrate')
  async celebrateMilestone(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.celebrateMilestone(user.id, id) };
  }

  @Get('supplements')
  async supplements(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.mySupplements(user.id) };
  }
  @Get('supplements/today')
  async supplementsToday(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.todaysSupplementLog(user.id) };
  }
  @Post('supplements')
  async upsertSupplement(@CurrentUser() user: AuthUser, @Body() body: UpsertSupplementDto) {
    return { data: await this.clients.upsertSupplement(user.id, body) };
  }
  @Delete('supplements/:id')
  async deactivateSupplement(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.clients.deactivateSupplement(user.id, id) };
  }
  @Post('supplements/:id/taken')
  async logSupplementTaken(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: LogSupplementTakenDto,
  ) {
    return { data: await this.clients.logSupplementTaken(user.id, id, body.slot) };
  }

  @Get('festivals')
  festivals() {
    return { data: this.clients.upcomingFestivals() };
  }

  @Get('weekly-summary')
  async weeklySummary(@CurrentUser() user: AuthUser) {
    return { data: await this.clients.myWeeklySummary(user.id) };
  }

  @Get('recipes-cuisines')
  async cuisines() {
    return { data: await this.clients.listCuisines() };
  }
}