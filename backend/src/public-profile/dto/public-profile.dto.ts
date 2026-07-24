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
}

export class ProfileLinkDto {
  @IsString() @MaxLength(80)
  label!: string;

  @IsString() @MaxLength(2000)
  url!: string;

  @IsOptional() @IsIn(['whatsapp', 'instagram', 'website', 'calendar', 'shop', 'custom'])
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
