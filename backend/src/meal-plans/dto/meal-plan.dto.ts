import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MEAL_SLOTS } from '../meal-plans.types';

export class CreatePlanDto {
  @IsString()
  clientId!: string;

  /** First day of the week. The end date is derived (+6 days). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
  startDate!: string;

  @IsOptional() @IsInt() @Min(1) @Max(520)
  weekNumber?: number;
}

export class SetPlanStatusDto {
  @IsIn(['draft', 'published'])
  status!: 'draft' | 'published';
}

export class DuplicatePlanDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
  startDate!: string;
}

export class AddCardDto {
  @IsInt() @Min(1) @Max(7)
  dayNumber!: number;

  @IsIn(MEAL_SLOTS as unknown as string[])
  mealType!: string;

  @IsString() @MaxLength(200)
  mealName!: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsInt() @Min(0) @Max(10000)
  kcal?: number;

  @IsOptional() @IsString() @MaxLength(1000)
  ingredients?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  instructions?: string;

  /** Set when the meal was picked from the library rather than typed. */
  @IsOptional() @IsIn(['recipe', 'food'])
  sourceType?: 'recipe' | 'food';

  @IsOptional() @IsString()
  sourceId?: string;

  /** NUMERIC in Postgres — a number, not a string. The unit carries the words. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100000)
  quantity?: number;

  @IsOptional() @IsString() @MaxLength(50)
  unit?: string;
}

export class UpdateCardDto {
  @IsOptional() @IsString() @MaxLength(200)
  mealName?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsInt() @Min(0) @Max(10000)
  kcal?: number;

  @IsOptional() @IsString() @MaxLength(1000)
  ingredients?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  instructions?: string;

  @IsOptional() @IsInt() @Min(1) @Max(7)
  dayNumber?: number;

  @IsOptional() @IsIn(MEAL_SLOTS as unknown as string[])
  mealType?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100000)
  quantity?: number;

  @IsOptional() @IsString() @MaxLength(50)
  unit?: string;
}

export class GeneratePlanDto {
  /** Which slots the generated week should fill. */
  @IsArray() @ArrayMaxSize(10)
  @IsIn(MEAL_SLOTS as unknown as string[], { each: true })
  slots!: string[];

  /** Free-text steer, e.g. "high protein, no dairy after 6pm". */
  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;

  /** Replace existing cards instead of appending to them. */
  @IsOptional()
  replace?: boolean;
}
