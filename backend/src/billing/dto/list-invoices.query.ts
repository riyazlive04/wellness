import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'cancelled', 'expired', 'all'] as const;

export class ListInvoicesQuery {
  @IsOptional() @IsIn(STATUSES as unknown as string[])
  status?: (typeof STATUSES)[number];

  @IsOptional() @IsUUID()
  workspaceId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset?: number;
}