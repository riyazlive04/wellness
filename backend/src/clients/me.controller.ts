import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { ClientsService } from './clients.service';

/**
 * Client-portal endpoints. Anyone with a valid JWT can call them — service
 * will return 404 if no clients row links to this user_id.
 */
@ApiTags('Me · Client portal')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private readonly clients: ClientsService) {}

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
}