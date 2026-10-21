import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { Audit } from '../admin/audit/audit.decorator';
import { TrialService } from './trial.service';

class ExtendTrialDto {
  /** Days to add from today. Ignored when `until` is given. */
  @IsOptional() @IsInt() @Min(1) @Max(365) days?: number;
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
