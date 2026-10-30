import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PatchPublicProfileDto {
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsString() @MaxLength(120)
  headline?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  bio?: string | null;

  @IsOptional() @IsBoolean()
  show_join_cta?: boolean;

  /**
   * Practitioner photo URL. An empty string removes it, which is why this is
   * not @IsUrl: that would reject the clear.
   */
  @IsOptional() @IsString() @MaxLength(2000)
  photo_url?: string | null;
}

export class ProfileLinkDto {
  @IsString() @MaxLength(80)
  label!: string;

  @IsString() @MaxLength(2000)
  url!: string;

  @IsOptional() @IsIn(['whatsapp', 'instagram', 'youtube', 'website', 'calendar', 'shop', 'custom'])
  icon?: string;

  @IsOptional() @IsBoolean()
  enabled?: boolean;
}

export class ReplaceProfileLinksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProfileLinkDto)
  links!: ProfileLinkDto[];
}
