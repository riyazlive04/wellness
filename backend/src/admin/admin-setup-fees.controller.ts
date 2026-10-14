import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { PLANS } from '../billing/plans';
import { PrismaService } from '../database/prisma.service';
import { Audit } from './audit/audit.decorator';

const METHODS = ['upi', 'bank', 'cash', 'other'] as const;

export class RecordSetupFeeDto {
  @IsIn(PLANS.map((p) => p.key))
  plan_key!: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  amount_inr!: number;

  @IsIn(METHODS)
  method!: (typeof METHODS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsDateString()
  paid_at?: string;
}

export interface SetupFeeRow {
  id: string;
  plan_key: string;
  amount_inr: number;
  paid_at: Date;
  method: string | null;
  reference: string | null;
  manual: boolean;
}

/**
 * Setup fees a practice paid outside the app. Recording one marks the plan the
 * practice chose and stops Razorpay charging that fee again on subscribe.
 */
@ApiTags('Admin · Workspaces')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/workspaces/:id/setup-fees', version: '1' })
export class AdminSetupFeesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Setup fees paid by this practice (Razorpay and manual).' })
  async list(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: SetupFeeRow[] }> {
    const rows = await this.prisma.$queryRawUnsafe<SetupFeeRow[]>(
      `SELECT razorpay_subscription_id AS id, plan_key, amount_inr, paid_at, method, reference,
              (razorpay_subscription_id LIKE 'manual:%') AS manual
         FROM public.workspace_setup_fee_payments WHERE workspace_id = $1::uuid ORDER BY paid_at DESC`,
      id,
    );
    return { data: rows };
  }

  @Post()
  @HttpCode(201)
  @Audit({ action: 'workspace.setup_fee_recorded', resourceType: 'workspace', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Record a setup fee paid outside Razorpay.' })
  async record(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordSetupFeeDto) {
    const paidAt = dto.paid_at ? new Date(dto.paid_at) : new Date();
    if (paidAt.getTime() > Date.now() + 86_400_000) throw new BadRequestException('Payment date can’t be in the future.');
    const ws = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.workspaces WHERE id = $1::uuid AND status <> 'deleted'`, id,
    );
    if (!ws.length) throw new NotFoundException('Practice not found.');
    const key = `manual:${randomUUID()}`;
    await this.prisma.$transaction([
      this.prisma.$executeRawUnsafe(
        `INSERT INTO public.workspace_setup_fee_payments
           (razorpay_subscription_id, workspace_id, plan_key, amount_inr, paid_at, method, reference, recorded_by)
         VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8::uuid)`,
        key, id, dto.plan_key, dto.amount_inr, paidAt, dto.method, dto.reference?.trim() || null, user.id,
      ),
      this.prisma.$executeRawUnsafe(
        `UPDATE public.workspaces SET setup_fee_paid_at = COALESCE(setup_fee_paid_at, $2) WHERE id = $1::uuid`, id, paidAt,
      ),
    ]);
    return { data: { id: key } };
  }

  @Delete(':feeId')
  @HttpCode(200)
  @Audit({ action: 'workspace.setup_fee_removed', resourceType: 'workspace', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Remove a setup fee that was recorded by hand by mistake.' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Param('feeId') feeId: string) {
    if (!feeId.startsWith('manual:')) throw new BadRequestException('Only fees recorded by hand can be removed.');
    const gone = await this.prisma.$queryRawUnsafe<Array<{ paid_at: Date }>>(
      `DELETE FROM public.workspace_setup_fee_payments WHERE workspace_id = $1::uuid AND razorpay_subscription_id = $2 RETURNING paid_at`, id, feeId,
    );
    if (!gone.length) throw new NotFoundException('Fee not found.');
    // Clear the "paid" stamp if this fee set it and nothing is left, so the
    // fee is due again. An older (pre-table) stamp is left alone.
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.workspaces SET setup_fee_paid_at = NULL
        WHERE id = $1::uuid AND setup_fee_paid_at = $2
          AND NOT EXISTS (SELECT 1 FROM public.workspace_setup_fee_payments p WHERE p.workspace_id = $1::uuid)`, id, gone[0].paid_at,
    );
    return { data: { removed: true } };
  }
}
