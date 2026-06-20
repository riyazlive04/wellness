import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { Audit } from '../admin/audit/audit.decorator';
import { PoliciesService } from './policies.service';

class PublishPolicyDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsString() @MinLength(1) @MaxLength(100_000) content!: string;
}

/**
 * Privacy policy — author side. Sirah Life super admins write and publish the
 * single platform privacy policy. Each publish creates a new version; workspace
 * owners must re-accept after a change.
 */
@ApiTags('Admin · Privacy policy')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/policies/privacy', version: '1' })
export class AdminPoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  @ApiOperation({ summary: 'Current policy + version history.' })
  async get() {
    const [current, versions] = await Promise.all([
      this.policies.getCurrent(),
      this.policies.listVersions(),
    ]);
    return { data: { current, versions } };
  }

  @Put()
  @Audit({ action: 'policy.privacy.publish', resourceType: 'privacy_policy' })
  @ApiOperation({ summary: 'Publish a new version of the privacy policy.' })
  async publish(@CurrentUser() user: AuthUser, @Body() dto: PublishPolicyDto) {
    return { data: await this.policies.publish({ title: dto.title, content: dto.content }, user.id) };
  }
}
