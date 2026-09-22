import { IsEmail, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /** What the lead wants from the call, in their own words. */
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
