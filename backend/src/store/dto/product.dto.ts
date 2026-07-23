import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const PRODUCT_KINDS = ['physical', 'digital', 'service'] as const;
export const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;

/**
 * Prices are paise integers. The ceiling (₹2.1 crore) is the int cast used when
 * reading the bigint columns back — see StoreService's `::int` casts.
 */
const MAX_PAISE = 2_000_000_000;

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(PRODUCT_KINDS)
  kind?: (typeof PRODUCT_KINDS)[number];

  @IsInt()
  @Min(0)
  @Max(MAX_PAISE)
  pricePaise!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PAISE)
  compareAtPaise?: number;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  imageUrl?: string;

  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: (typeof PRODUCT_STATUSES)[number];

  /** Omit for unlimited stock (the normal case for digital/service products). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stockQuantity?: number;
}

/**
 * PATCH semantics, deliberately three-valued for the optional fields:
 *   key absent  → leave the column untouched
 *   key = null  → CLEAR the column
 *   key = value → set it
 *
 * `@IsOptional()` skips validation for null as well as undefined, so an explicit
 * null passes straight through to the service, which distinguishes the two.
 * Without this, "Remove photo" / "make stock unlimited" were impossible — the
 * cleared value arrived as undefined and COALESCE kept the old one.
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsIn(PRODUCT_KINDS)
  kind?: (typeof PRODUCT_KINDS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PAISE)
  pricePaise?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PAISE)
  compareAtPaise?: number | null;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  imageUrl?: string | null;

  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: (typeof PRODUCT_STATUSES)[number];

  /** null = unlimited stock. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stockQuantity?: number | null;
}

export class StartCheckoutDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;
}

export class VerifyProductPaymentDto {
  @IsString()
  razorpayOrderId!: string;

  @IsString()
  razorpayPaymentId!: string;

  @IsString()
  razorpaySignature!: string;
}
