import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { StartCheckoutDto, VerifyProductPaymentDto } from './dto/product.dto';
import { StoreService } from './store.service';

/**
 * Client-facing storefront.
 *
 * No role decorator, by the same convention as the other `/me/*` routes: the
 * service resolves the caller's client row and derives the workspace from it,
 * so a client can only ever see and buy from their own nutritionist.
 */
@ApiTags('store')
@Controller({ path: 'me/store', version: '1' })
export class StoreClientController {
  constructor(private readonly store: StoreService) {}

  @Get('products')
  @ApiOperation({ summary: 'Published products from my nutritionist.' })
  async products(@CurrentUser() u: AuthUser) {
    return { data: await this.store.listStorefront(u.id) };
  }

  @Get('orders')
  @ApiOperation({ summary: 'My purchase history.' })
  async orders(@CurrentUser() u: AuthUser) {
    return { data: await this.store.myOrders(u.id) };
  }

  @Post('checkout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Open a Razorpay order for a product. Delivers nothing on its own.' })
  async checkout(@CurrentUser() u: AuthUser, @Body() dto: StartCheckoutDto) {
    return { data: await this.store.startCheckout(u.id, u.email, dto) };
  }

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify the payment signature. The webhook still owns fulfilment.' })
  async verify(@Body() dto: VerifyProductPaymentDto) {
    return { data: this.store.verifyPayment(dto) };
  }
}
