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

  @IsOptional()
  @IsObject()
  source?: Record<string, unknown>;
}

export class CheckWhatsappDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;
}
