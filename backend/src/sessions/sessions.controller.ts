import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentSessionId } from '../auth/decorators/current-session.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { SessionsService } from './sessions.service';

class RegisterDeviceDto {
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() @MaxLength(40) platform?: string;
  @IsOptional() @IsString() @MaxLength(40) platformVersion?: string;
}

@ApiTags('Me · Sessions')
@ApiBearerAuth()
@Controller({ path: 'me/sessions', version: '1' })
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'List the signed-in user’s active login sessions (devices).' })
  list(@CurrentUser() user: AuthUser, @CurrentSessionId() sessionId: string | null) {
    return this.sessions.list(user.id, sessionId);
  }

  @Post('device')
  @ApiOperation({ summary: 'Record the real device model (User-Agent Client Hints) for this session.' })
  registerDevice(
    @CurrentUser() user: AuthUser,
    @CurrentSessionId() sessionId: string | null,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.sessions.registerDevice(user.id, sessionId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke (sign out) one of the user’s other sessions.' })
  revoke(
    @CurrentUser() user: AuthUser,
    @CurrentSessionId() sessionId: string | null,
    @Param('id') id: string,
  ) {
    return this.sessions.revoke(user.id, id, sessionId);
  }
}
