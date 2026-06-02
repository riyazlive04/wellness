import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListWorkspacesQuery {
  @IsOptional()
  @IsIn(['active', 'suspended', 'deleted', 'all'])
  status?: 'active' | 'suspended' | 'deleted' | 'all';

  @IsOptional()
  @IsString()
  plan?: string;

  /** Search by workspace name or owner email (case-insensitive substring). */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
