import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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

  /** Identity document number — PAN (10), Aadhaar (12), or driving licence (≤20). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pan?: string;

  /** What the practice focuses on, e.g. "Diabetes", "PCOD / PCOS". */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  specializations?: string[];

  /** Business address state (GST place of supply). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  state?: string;

  /** 6-digit Indian PIN code. */
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Pincode must be 6 digits.' })
  pincode?: string;

  /** super_admin only (the controller rejects it otherwise); everyone else starts on 'trial'. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  plan?: string;
}
