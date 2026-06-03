import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const STATUSES = ['pending', 'in_review', 'completed', 'rejected', 'all'] as const;

export class ListDeletionRequestsQuery {
  @IsOptional() @IsIn(STATUSES as unknown as string[])
  status?: (typeof STATUSES)[number];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset?: number;
}