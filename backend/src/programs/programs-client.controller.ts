import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ProgramsService } from './programs.service';

class EnrollDto {
  @IsString() templateId!: string;
}

class ChatMessageIn {
  @IsString() @MinLength(1) @MaxLength(4000) content!: string;
}

/**
 * Module 8 — client view of their assigned programs. Self-scoped via the JWT
 * (clients.user_id). Replaces the synthetic daily tasks the client portal used
 * to fabricate with real program tasks + completion.
 */
@ApiTags('Program Engine · Client')
@ApiBearerAuth()
@Controller({ path: 'me/programs', version: '1' })
export class ProgramsClientController {
  constructor(private readonly programs: ProgramsService) {}

  @Get('assigned')
  @ApiOperation({ summary: 'My program assignments with progress.' })
  async assigned(@CurrentUser() u: AuthUser) {
    return { data: await this.programs.myAssignments(u.id) };
  }

  @Get('today')
  @ApiOperation({ summary: "Today's program tasks across my active programs." })
  async today(@CurrentUser() u: AuthUser) {
    return { data: await this.programs.todaysTasks(u.id) };
  }

  @Post('tasks/:id/toggle')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a program task done/undone for today.' })
  async toggle(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.programs.toggleTask(u.id, id) };
  }

  @Get('catalog')
  @ApiOperation({ summary: 'Published programs in my workspace I can join (with enrolled flag).' })
  async catalog(@CurrentUser() u: AuthUser) {
    return { data: await this.programs.clientCatalog(u.id) };
  }

  @Get('catalog/:id')
  @ApiOperation({ summary: 'Full client-safe detail for one published program.' })
  async catalogDetail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.programs.clientProgramDetail(u.id, id) };
  }

  @Post('enroll')
  @HttpCode(200)
  @ApiOperation({ summary: 'Join a published program (self-enroll).' })
  async enroll(@CurrentUser() u: AuthUser, @Body() dto: EnrollDto) {
    return { data: await this.programs.selfEnroll(u.id, dto.templateId) };
  }

  @Post('leave')
  @HttpCode(200)
  @ApiOperation({ summary: 'Leave a program I joined.' })
  async leave(@CurrentUser() u: AuthUser, @Body() dto: EnrollDto) {
    return { data: await this.programs.leaveProgram(u.id, dto.templateId) };
  }

  // ── Program group chat (client side) ──
  // Access requires an active assignment to the template — enforced in the
  // service. :id is the program TEMPLATE id (matches catalog/:id).
  @Get(':id/chat')
  @ApiOperation({ summary: 'Group chat for a program I am enrolled in.' })
  async chatList(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.programs.chatListClient(u.id, id) };
  }

  @Post(':id/chat')
  @HttpCode(201)
  @ApiOperation({ summary: 'Post to the group chat of a program I am enrolled in.' })
  async chatSend(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ChatMessageIn) {
    return { data: await this.programs.chatSendClient(u.id, id, dto.content) };
  }
}
