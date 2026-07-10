import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MEAL_TYPES } from '../plate-vision.types';

export class LogPlateItemDto {
  @IsString() @MaxLength(200) detected_name!: string;
  @IsOptional() @IsString() food_id?: string;
  @IsOptional() @IsString() @MaxLength(200) food_query?: string;
  @IsNumber() @Min(0.1) quantity_g!: number;
  @IsOptional() @IsString() @MaxLength(40) cooking_method?: string;
  @IsOptional() @IsNumber() ai_confidence?: number;
}

export class LogPlateDto {
  @IsIn(MEAL_TYPES as unknown as string[]) meal_type!: string;
  // The client stores a downscaled inline JPEG thumbnail (~40-80 KB) as a
  // base64 data URL, so this must fit a data URI (~110 K chars), not a plain
  // URL. Still bounded to reject full-res images. DB column is unbounded text.
  @IsOptional() @IsString() @MaxLength(300000) photo_url?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsString() logged_at?: string;
  @IsOptional() @IsIn(['plate_vision', 'voice', 'manual']) source?: 'plate_vision' | 'voice' | 'manual';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => LogPlateItemDto)
  items!: LogPlateItemDto[];
}

export class ReviewPlateDto {
  @IsIn(['approved', 'adjusted', 'flagged']) status!: 'approved' | 'adjusted' | 'flagged';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
