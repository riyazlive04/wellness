import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

const STATUSES = ['created', 'authorized', 'captured', 'refunded', 'failed', 'all'] as const;

export class ListPaymentsQuery {
  @IsOptional() @IsIn(STATUSES as unknown as string[])
  status?: (typeof STATUSES)[number];

  @IsOptional() @IsUUID()
  workspaceId?: string;

  @IsOptional() @IsString()
  q?: string;

  /** Inclusive IST date range, YYYY-MM-DD. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD.' })
  from?: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD.' })
  to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset?: number;
}