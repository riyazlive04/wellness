import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { EnterpriseAiService } from './enterprise-ai.service';

class FeedbackDto {
  @IsIn(['message', 'recommendation', 'insight']) subjectType!: string;
  @IsOptional() @IsString() subjectId?: string;
  @IsIn(['up', 'down']) rating!: 'up' | 'down';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

/**
 * Module 12 — AI feedback (learning signal). Self-scoped so ANY authenticated
 * user (including clients giving feedback on the Wellness AI) can rate an AI
 * output up/down. One feedback per (user, subject).
 */
@ApiTags('AI Feedback')
@ApiBearerAuth()
@Controller({ path: 'me/ai', version: '1' })
export class AiFeedbackController {
  constructor(private readonly ai: EnterpriseAiService) {}

  @Post('feedback')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rate an AI output up/down (learning signal).' })
  async feedback(@CurrentUser() u: AuthUser, @Body() dto: FeedbackDto) {
    return { data: await this.ai.recordFeedback(u, dto) };
  }
}
