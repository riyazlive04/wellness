import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const CHANNELS = ['support', 'self', 'admin'] as const;

export class CreateDeletionRequestDto {
  @IsEmail()
  targetEmail!: string;

  @IsOptional() @IsUUID()
  targetUserId?: string;

  @IsOptional() @IsUUID()
  workspaceId?: string;

  @IsIn(CHANNELS as unknown as string[])
  channel!: (typeof CHANNELS)[number];

  @IsOptional() @IsString() @MaxLength(2000)
  reason?: string;
}

export class UpdateDeletionRequestDto {
  @IsIn(['pending', 'in_review', 'completed', 'rejected'])
  status!: 'pending' | 'in_review' | 'completed' | 'rejected';

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}