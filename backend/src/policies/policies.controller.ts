import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { PoliciesService } from './policies.service';

/**
 * Privacy policy — reader side. Any authenticated user can read the current
 * NUSI privacy policy and record their acceptance. Workspace owners are
 * additionally forced to accept (must_accept) before using the dashboard.
 */
@ApiTags('Privacy policy')
@ApiBearerAuth()
@Controller({ path: 'policies/privacy', version: '1' })
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get('current')
  @ApiOperation({ summary: 'Current privacy policy + the caller\'s acceptance state.' })
  async current(@CurrentUser() user: AuthUser) {
    return { data: await this.policies.getCurrentForUser(user.id, user.workspaceRole ?? null) };
  }

  @Post('accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record the caller\'s acceptance of the current policy.' })
  async accept(@CurrentUser() user: AuthUser) {
    return { data: await this.policies.acceptCurrent(user.id, user.workspaceId ?? null) };
  }
}
