import { IsEmail, IsHexColor, IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import type { OrgRole } from '../organizations.types';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export class CreateOrgDto {
  @IsString() @MaxLength(120)
  name!: string;

  @IsString() @Matches(SLUG_RE, { message: 'slug must be 3-64 chars: lowercase, digits, hyphens.' })
  slug!: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsHexColor()
  brand_color?: string;

  @IsOptional() @IsEmail()
  billing_email?: string;
}

export class UpdateOrgDto {
  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @Matches(SLUG_RE)
  slug?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string | null;

  @IsOptional() @IsHexColor()
  brand_color?: string | null;

  @IsOptional() @IsUrl()
  logo_url?: string | null;

  @IsOptional() @IsEmail()
  billing_email?: string | null;
}

export class AddOrgMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(['org_owner', 'org_admin', 'org_viewer'])
  role!: OrgRole;
}

export class UpdateOrgMemberDto {
  @IsIn(['org_owner', 'org_admin', 'org_viewer'])
  role!: OrgRole;
}

export class AttachWorkspaceDto {
  @IsString()
  workspace_id!: string;
}
