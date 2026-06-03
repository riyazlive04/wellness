import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}