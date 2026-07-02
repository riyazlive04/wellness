import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { BarcodeService } from './barcode.service';

class LogBarcodeDto {
  @IsString() @MinLength(6) @MaxLength(18) barcode!: string;
  @IsString() mealType!: string;
  @IsOptional() @IsInt() @Min(1) @Max(2000) servingGrams?: number;
  @IsOptional() @IsString() @MaxLength(160) mealName?: string;
}

/** Product typed from the pack label when no database had the barcode. */
class ManualProductDto {
  @IsString() @MinLength(6) @MaxLength(18) barcode!: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(120) brand?: string;
  @IsOptional() @IsString() @MaxLength(60) serving_size?: string;
  @IsNumber() @Min(0) @Max(2000) kcal_100g!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) protein_100g?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) carb_100g?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) fat_100g?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) fiber_100g?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100000) sodium_mg_100g?: number;
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

  @Post('manual')
  @HttpCode(201)
  @ApiOperation({ summary: "Add a product from its label when no database has the barcode (caches it for everyone)." })
  async addManual(@Body() dto: ManualProductDto) {
    return { data: await this.barcode.saveManual(dto) };
  }

  @Post('log')
  @HttpCode(201)
  @ApiOperation({ summary: 'Log a scanned packaged food as a meal.' })
  async log(@CurrentUser() user: AuthUser, @Body() dto: LogBarcodeDto) {
    return { data: await this.barcode.logMeal(user.id, dto) };
  }
}
