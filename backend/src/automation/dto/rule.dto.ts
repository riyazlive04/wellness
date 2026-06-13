import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { AutomationAction, AutomationCondition } from '../automation.types';

export class ConditionDto implements AutomationCondition {
  @IsString() @MaxLength(80)
  field!: string;

  @IsIn(['eq', 'neq', 'contains', 'gt', 'lt', 'exists', 'not_exists'])
  operator!: AutomationCondition['operator'];

  @IsOptional()
  value?: unknown;
}

export class ActionDto {
  @IsIn(['notify.message', 'webhook.post'])
  type!: AutomationAction['type'];

  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  body?: string;

  @IsOptional() @IsString() @MaxLength(60)
  recipient_scope?: 'workspace';

  @IsOptional() @IsString() @MaxLength(500)
  url?: string;

  @IsOptional() @IsObject()
  headers?: Record<string, string>;
}

export class CreateRuleDto {
  @IsString() @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  @IsOptional() @IsBoolean()
  is_enabled?: boolean;

  @IsString() @MaxLength(80)
  trigger_event!: string;

  @IsOptional() @IsArray() @ArrayMaxSize(16)
  @ValidateNested({ each: true }) @Type(() => ConditionDto)
  conditions?: ConditionDto[];

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8)
  @ValidateNested({ each: true }) @Type(() => ActionDto)
  actions!: ActionDto[];
}

export class UpdateRuleDto {
  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  @IsOptional() @IsBoolean()
  is_enabled?: boolean;

  @IsOptional() @IsString() @MaxLength(80)
  trigger_event?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(16)
  @ValidateNested({ each: true }) @Type(() => ConditionDto)
  conditions?: ConditionDto[];

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8)
  @ValidateNested({ each: true }) @Type(() => ActionDto)
  actions?: ActionDto[];
}
