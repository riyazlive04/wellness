import { IsBoolean, IsEmail, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  practice_size?: string;

  /** Whether the lead has completed a nutrition / dietetics degree. */
  @IsOptional()
  @IsBoolean()
  nutrition_degree?: boolean;

  /** What the lead wants from the call, in their own words. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  purpose?: string;

  /** ISO instant of the 45-minute call slot the lead picked. */
  @IsOptional()
  @IsISO8601()
  slot_start?: string;

  @IsOptional()
  @IsObject()
  source?: Record<string, unknown>;
}

/**
 * The booking form as far as the visitor has filled it, sent once their
 * WhatsApp number is verified - so someone who leaves without booking can
 * still be followed up. Every field but the phone is optional.
 */
export class LeadProgressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** Kept only once this address has passed its own email code. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  practice_size?: string;

  @IsOptional()
  @IsBoolean()
  nutrition_degree?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  purpose?: string;

  @IsOptional()
  @IsObject()
  source?: Record<string, unknown>;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code!: string;
}

export class EmailDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(200)
  email!: string;
}

export class VerifyEmailOtpDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(200)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code!: string;
}

export class PurposeDto {
  @IsString()
  @MaxLength(300)
  purpose!: string;
}

export class NameDto {
  @IsString()
  @MaxLength(80)
  name!: string;
}

export class PhoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;
}

export class ChangeStageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  status!: string;
}
