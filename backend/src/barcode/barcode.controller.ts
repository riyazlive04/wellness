import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { BarcodeService } from './barcode.service';

class LogBarcodeDto {
  @IsString() @MinLength(6) @MaxLength(18) barcode!: string;
  @IsString() mealType!: string;
  @IsOptional() @IsInt() @Min(1) @Max(2000) servingGrams?: number;
  @IsOptional() @IsString() @MaxLength(160) mealName?: string;
}

/**
 * Barcode lookup + scan-to-log for the client portal. Self-scoped via the JWT.
 */
@ApiTags('Barcode')
@ApiBearerAuth()
@Controller({ path: 'me/foods/barcode', version: '1' })
export class BarcodeController {
  constructor(private readonly barcode: BarcodeService) {}

  @Get(':code')
  @ApiOperation({ summary: 'Resolve a barcode to a product (cache → Open Food Facts).' })
  async lookup(@Param('code') code: string) {
    return { data: await this.barcode.lookup(code) };
  }

  @Post('log')
  @HttpCode(201)
  @ApiOperation({ summary: 'Log a scanned packaged food as a meal.' })
  async log(@CurrentUser() user: AuthUser, @Body() dto: LogBarcodeDto) {
    return { data: await this.barcode.logMeal(user.id, dto) };
  }
}
