import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength, ValidateNested,
} from 'class-validator';
import { INVITABLE_ROLES, MEMBER_ROLES } from '../team.service';

export class InviteMemberDto {
  @IsEmail() email!: string;
  @IsIn(INVITABLE_ROLES as unknown as string[]) role!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateMemberRoleDto {
  @IsIn(MEMBER_ROLES as unknown as string[]) role!: string;
}

export class PermissionOverrideDto {
  @IsString() permission!: string;
  @IsIn(['grant', 'deny']) effect!: 'grant' | 'deny';
}

export class SetPermissionsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PermissionOverrideDto)
  overrides!: PermissionOverrideDto[];
}
