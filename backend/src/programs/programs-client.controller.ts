import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ProgramsService } from './programs.service';

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
}
