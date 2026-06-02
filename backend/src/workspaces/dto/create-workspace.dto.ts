import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWorkspaceDto {
  /** Practice / clinic display name. Required. */
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  /** Optional URL-safe identifier. Auto-derived from `name` if omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  display_name?: string;

  @IsOptional()
  @IsEmail()
  contact_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  contact_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  country_code?: string;

  /** GST identification number (India). 15 chars when set. */
  @IsOptional()
  @IsString()
  @MaxLength(15)
  gstin?: string;

  /** PAN (India). 10 chars when set. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  pan?: string;

  /** Initial subscription plan label (defaults to 'trial' server-side). */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  plan?: string;
}
