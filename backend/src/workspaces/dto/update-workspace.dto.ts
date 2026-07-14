import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateWorkspaceDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) display_name?: string;
  /** Registered legal entity, shown on invoices. */
  @IsOptional() @IsString() @MaxLength(160) legal_name?: string;
  /** A hosted URL or a small (~256px) data: URI for the logo. */
  @IsOptional() @IsString() @MaxLength(500_000) logo_url?: string;
  /** 6- or 8-char hex (#RRGGBB / #RRGGBBAA), no validation here beyond length. */
  @IsOptional() @IsString() @MaxLength(9) brand_color?: string;
  /** Accent hex (#RRGGBB / #RRGGBBAA). */
  @IsOptional() @IsString() @MaxLength(9) brand_accent?: string;
  /** Shown on the client portal. */
  @IsOptional() @IsString() @MaxLength(200) tagline?: string;
  /** Private motivational quote shown on the owner's dashboard banner. */
  @IsOptional() @IsString() @MaxLength(280) dashboard_quote?: string;
  /** Enterprise: hide NUSI branding from the client portal + invoices. */
  @IsOptional() @IsBoolean() white_label?: boolean;
  @IsOptional() @IsEmail() contact_email?: string;
  @IsOptional() @IsString() @MaxLength(32) contact_phone?: string;
  /** IANA timezone, e.g. "Asia/Kolkata". */
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  /** Default locale / language tag, e.g. "en-IN". */
  @IsOptional() @IsString() @MaxLength(16) locale?: string;
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
