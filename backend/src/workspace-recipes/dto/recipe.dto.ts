import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { CookingMethodCode } from '../../nutrition-engine/nutrition.types';

const COOKING_METHODS: CookingMethodCode[] = [
  'raw', 'boiled', 'steamed', 'grilled', 'roasted', 'baked',
  'sauteed', 'pan_fried', 'deep_fried', 'stir_fried', 'curried',
  'tandoor', 'pressure_cooked', 'microwaved', 'fermented',
];

export class RecipeIngredientDto {
  @IsUUID()
  food_id!: string;

  @IsNumber()
  @Min(0.01)
  @Max(10_000)
  quantity_g!: number;

  @IsOptional()
  @IsIn(COOKING_METHODS)
  cooking_method?: CookingMethodCode;

  @IsOptional()
  @IsIn(['raw', 'as_consumed'])
  quantity_state?: 'raw' | 'as_consumed';

  @IsOptional()
  @IsNumber()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CreateRecipeDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  @IsOptional() @IsString() @MaxLength(100)
  category?: string | null;

  @IsOptional() @IsNumber() @Min(1) @Max(50)
  servings?: number;

  @IsOptional() @IsNumber() @Min(0.1) @Max(5.0)
  yield_factor?: number;

  @IsOptional() @IsString() @MaxLength(8000)
  instructions?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string | null;

  @IsOptional() @IsBoolean()
  is_published?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients!: RecipeIngredientDto[];
}

export class UpdateRecipeDto {
  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  @IsOptional() @IsString() @MaxLength(100)
  category?: string | null;

  @IsOptional() @IsNumber() @Min(1) @Max(50)
  servings?: number;

  @IsOptional() @IsNumber() @Min(0.1) @Max(5.0)
  yield_factor?: number;

  @IsOptional() @IsString() @MaxLength(8000)
  instructions?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string | null;

  @IsOptional() @IsBoolean()
  is_published?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients?: RecipeIngredientDto[];
}
