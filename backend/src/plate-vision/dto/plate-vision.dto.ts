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

/**
 * Model-estimated nutrition for one item, on the ai_estimate path.
 *
 * Deliberately permissive on the upper bound here — the service caps these
 * values (AI_ITEM_CAPS) rather than rejecting the whole plate, because a single
 * odd number should not lose the user the meal they just photographed.
 */
export class AiItemNutritionDto {
  @IsNumber() @Min(0) calories_kcal!: number;
  @IsNumber() @Min(0) protein_g!: number;
  @IsNumber() @Min(0) carbs_g!: number;
  @IsNumber() @Min(0) fat_g!: number;
  @IsOptional() @IsNumber() @Min(0) fiber_g?: number;
  @IsOptional() @IsNumber() @Min(0) sugar_g?: number;
  @IsOptional() @IsNumber() @Min(0) sodium_mg?: number;
}

export class PlateAlternativeDto {
  @IsString() @MaxLength(200) dish_name!: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class CaloriesRangeDto {
  @IsNumber() @Min(0) min!: number;
  @IsNumber() @Min(0) max!: number;
}

/** Dish-level context from the analyze step, frozen onto the plate row. */
export class PlateAnalysisDto {
  @IsOptional() @IsString() @MaxLength(200) dish_name?: string;
  @IsOptional() @IsString() @MaxLength(80) cuisine?: string;
  @IsOptional() @IsIn(['high', 'medium', 'low']) confidence?: 'high' | 'medium' | 'low';

  @IsOptional() @IsArray() @ArrayMaxSize(5)
  @ValidateNested({ each: true }) @Type(() => PlateAlternativeDto)
  alternatives?: PlateAlternativeDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true })
  assumptions?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true })
  health_notes?: string[];

  @IsOptional() @ValidateNested() @Type(() => CaloriesRangeDto)
  calories_range?: CaloriesRangeDto;
}

export class LogPlateItemDto {
  @IsString() @MaxLength(200) detected_name!: string;
  @IsOptional() @IsString() food_id?: string;
  @IsOptional() @IsString() @MaxLength(200) food_query?: string;
  @IsNumber() @Min(0.1) quantity_g!: number;
  @IsOptional() @IsString() @MaxLength(40) cooking_method?: string;
  @IsOptional() @IsNumber() ai_confidence?: number;

  /** Required in practice when the plate is logged with nutrition_source 'ai_estimate'. */
  @IsOptional() @ValidateNested() @Type(() => AiItemNutritionDto)
  nutrition?: AiItemNutritionDto;
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

  /**
   * Omitted means 'engine', so voice and manual callers keep working unchanged.
   * The plate capture flow sends 'ai_estimate'.
   */
  @IsOptional() @IsIn(['engine', 'ai_estimate']) nutrition_source?: 'engine' | 'ai_estimate';

  @IsOptional() @ValidateNested() @Type(() => PlateAnalysisDto)
  analysis?: PlateAnalysisDto;

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
