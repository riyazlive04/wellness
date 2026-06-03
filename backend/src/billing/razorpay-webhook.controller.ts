import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { RazorpayWebhookService } from './razorpay-webhook.service';

/**
 * Public webhook endpoint for Razorpay. Authentication is the HMAC signature
 * — JWT does not apply. Mounted at /api/v1/webhooks/razorpay.
 *
 * Razorpay will retry with exponential backoff on non-2xx for ~24h; the
 * handler is idempotent (unique constraint on webhook_events) so retries
 * are safe.
 */
@ApiTags('Webhooks · Razorpay')
@Controller({ path: 'webhooks/razorpay', version: '1' })
export class RazorpayWebhookController {
  constructor(private readonly webhooks: RazorpayWebhookService) {}

  @Public()
  @Post()
  @HttpCode(200)
  // Razorpay can burst on incident replay — allow more than the default 200/min.
  @Throttle({ medium: { ttl: 60_000, limit: 600 } })
  @ApiOperation({ summary: 'Razorpay webhook receiver. Verifies HMAC, upserts payments/subs/invoices.' })
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Webhook body could not be read');
    }
    return this.webhooks.handle(req.rawBody, signature, eventId);
  }
}