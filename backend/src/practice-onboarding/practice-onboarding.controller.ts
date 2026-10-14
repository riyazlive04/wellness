import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { Audit } from '../admin/audit/audit.decorator';
import { PracticeOnboardingService } from './practice-onboarding.service';
import { SECTION_KEYS, type SectionKey } from './sections';

class CreateOnboardingDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEmail() @MaxLength(160) email!: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsIn(['trial', 'starter', 'growth', 'scale_pro']) plan?: string;
}

class RequestChangesDto {
  @IsIn([...SECTION_KEYS]) section!: string;
  @IsString() @MinLength(3) @MaxLength(400) note!: string;
}

class SaveSectionDto {
  @IsObject() data!: Record<string, unknown>;
  @IsBoolean() complete!: boolean;
  /** Account section only; never stored with the section. */
  @IsOptional() @IsString() @MaxLength(72) password?: string;
}

@ApiTags('Admin · Practice onboarding')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/practice-onboarding', version: '1' })
export class AdminPracticeOnboardingController {
  constructor(private readonly svc: PracticeOnboardingService) {}

  @Get()
  @ApiOperation({ summary: 'Onboarding links with each section’s status.' })
  async list() {
    return { data: await this.svc.list() };
  }

  @Post()
  @Audit({ action: 'practice_onboarding.create', resourceType: 'practice_onboarding' })
  @ApiOperation({ summary: 'Create a personal onboarding link for a nutritionist (expires in 7 days).' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateOnboardingDto) {
    return { data: await this.svc.create(user.id, dto) };
  }

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.detail(id) };
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Audit({ action: 'practice_onboarding.approve', resourceType: 'practice_onboarding', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Create the practice and start its 14-day trial.' })
  async approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.approve(id, user.id) };
  }

  @Post(':id/changes')
  @HttpCode(200)
  @Audit({ action: 'practice_onboarding.changes', resourceType: 'practice_onboarding', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Send a submitted onboarding back with one thing to fix.' })
  async changes(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestChangesDto) {
    return { data: await this.svc.requestChanges(id, user.id, dto.section, dto.note) };
  }

  @Post(':id/extend')
  @HttpCode(200)
  async extend(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.extend(id) };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Audit({ action: 'practice_onboarding.cancel', resourceType: 'practice_onboarding', resourceIdParam: 'id' })
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.svc.cancel(id) };
  }
}

/** The nutritionist's side: everything is keyed by the secret token in their link. */
@ApiTags('Practice onboarding')
@Public()
@Controller({ path: 'practice-onboarding', version: '1' })
export class PublicPracticeOnboardingController {
  constructor(private readonly svc: PracticeOnboardingService) {}

  @Get(':token')
  @Throttle({ medium: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Open a setup link: sections, status, and any change requested.' })
  async open(@Param('token') token: string) {
    return { data: await this.svc.open(token) };
  }

  @Put(':token/sections/:key')
  @Throttle({ medium: { ttl: 60_000, limit: 90 } })
  @ApiOperation({ summary: 'Save a section (autosave, or complete=true to mark it done).' })
  async save(@Param('token') token: string, @Param('key') key: string, @Body() dto: SaveSectionDto) {
    const k = (SECTION_KEYS as readonly string[]).includes(key) ? (key as SectionKey) : null;
    if (!k) return { data: null };
    return { data: await this.svc.saveSection(token, k, dto.data, dto.complete, dto.password) };
  }

  @Post(':token/submit')
  @HttpCode(200)
  @Throttle({ medium: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Submit all six sections for approval.' })
  async submit(@Param('token') token: string) {
    return { data: await this.svc.submit(token) };
  }
}
