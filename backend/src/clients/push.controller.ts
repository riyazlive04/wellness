import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

import { Public } from '../auth/decorators/public.decorator';
import { PushService } from './push.service';

/**
 * Subscription-rotation endpoint, called by the service worker — not by the app.
 *
 * It has to be @Public(): a `pushsubscriptionchange` event fires with no page,
 * no session, and no way to attach a JWT. Authorisation comes from `old_endpoint`
 * instead — an unguessable browser-issued URL we already hold — and the service
 * only ever moves an existing row, so a bogus endpoint changes nothing.
 */
class RotateSubscriptionDto {
  /** The endpoint the browser is retiring — must already exist in our table. */
  @IsString()
  @IsNotEmpty()
  old_endpoint!: string;

  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  auth!: string;
}

@ApiTags('push')
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Public()
  @Post('rotate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Swap a browser-rotated push subscription. Called by the service worker on pushsubscriptionchange (no session).',
  })
  rotate(@Body() dto: RotateSubscriptionDto) {
    return this.push.rotateSubscription({
      oldEndpoint: dto.old_endpoint,
      endpoint: dto.endpoint,
      p256dh: dto.p256dh,
      auth: dto.auth,
    });
  }
}
