import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Body for POST /join/:token/request — the prospect's own signup. */
export class RequestJoinDto {
  @IsOptional() @IsString() @MaxLength(120)
  name?: string;
}

/** Body for POST /workspaces/me/join-link/rotate. */
export class RotateJoinLinkDto {
  /** Link lifetime. Defaults to 30 days when omitted. */
  @IsOptional() @IsInt() @Min(1) @Max(365)
  ttlDays?: number;
}

/** Body for POST /workspaces/me/clients/join-requests/:id/reject. */
export class RejectJoinRequestDto {
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

/**
 * Body for DELETE /workspaces/me/clients/:clientId. `confirm` must be the
 * literal 'DELETE' — this endpoint destroys data across 40+ tables with no
 * undo, so it should be impossible to fire by accident (a stray fetch, a
 * mis-wired button, a replayed request).
 */
export class DeleteClientDto {
  @IsString()
  confirm!: string;
}
