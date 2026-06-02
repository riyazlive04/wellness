import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateWorkspaceDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) display_name?: string;
  @IsOptional() @IsString() @MaxLength(2048) logo_url?: string;
  /** 6- or 8-char hex (#RRGGBB / #RRGGBBAA), no validation here beyond length. */
  @IsOptional() @IsString() @MaxLength(9) brand_color?: string;
  @IsOptional() @IsEmail() contact_email?: string;
  @IsOptional() @IsString() @MaxLength(32) contact_phone?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(8) country_code?: string;
  @IsOptional() @IsString() @MaxLength(15) gstin?: string;
  @IsOptional() @IsString() @MaxLength(10) pan?: string;

  /** Plan changes go through billing; this is a stub. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  plan?: string;

  /** Status changes are super_admin-only; controller enforces. */
  @IsOptional()
  @IsIn(['active', 'suspended', 'deleted'])
  status?: 'active' | 'suspended' | 'deleted';
}
