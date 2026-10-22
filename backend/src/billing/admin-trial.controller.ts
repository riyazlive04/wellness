import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { Audit } from '../admin/audit/audit.decorator';
import { TrialService } from './trial.service';

class SendReminderDto {
  /** One channel, or omitted for every channel the practice has. */
  @IsOptional() @IsIn(['email', 'whatsapp']) channel?: 'email' | 'whatsapp';
}

class ExtendTrialDto {
  /**
   * Days to move the end date by. Negative shortens the trial, so an admin can
   * take time back as well as give it. Ignored when `until` is given.
   */
  @IsOptional() @IsInt() @Min(-365) @Max(365) days?: number;
  /** An explicit end date, YYYY-MM-DD. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'until must be YYYY-MM-DD.' })
  until?: string;
  /** Why — recorded in the audit log. */
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

/**
 * Extending a practice's trial. Until now the only way to change a trial
 * date was to edit the database by hand.
 */
@ApiTags('Admin · Trials')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/workspaces/:id/trial', version: '1' })
export class AdminTrialController {
  constructor(private readonly trials: TrialService) {}

  @Get('reminders')
  @ApiOperation({ summary: 'Every trial reminder sent to this practice, newest first.' })
  async reminders(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.trials.remindersFor(id) };
  }

  /**
   * Send a trial reminder now, outside the 9am schedule.
   *
   * For when a practice should hear from us today but is not in a 7/3/1/0
   * bucket — the gap that left Aboothahir with no warning between day 3 and
   * day 1. Claims the same dedupe row as the job, so the scheduled run will
   * not repeat it.
   */
  @Post('reminders/send')
  @Audit({ action: 'workspace.trial_reminder_sent', resourceType: 'workspace', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Send the trial reminder to this practice now.' })
  async sendReminder(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendReminderDto) {
    return { data: await this.trials.sendNow(id, dto.channel) };
  }

  @Post('extend')
  @Audit({ action: 'workspace.trial_extended', resourceType: 'workspace', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Give a practice more trial time.' })
  async extend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtendTrialDto,
  ) {
    return { data: await this.trials.extend(id, dto, user.id) };
  }
}
