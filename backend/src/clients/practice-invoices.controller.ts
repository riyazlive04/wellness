import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClientsService } from './clients.service';
import { PracticeInvoicesService } from './practice-invoices.service';
import { InvoicePaymentsService } from './invoice-payments.service';

class SaveInvoiceDto {
  /** [{ description, quantity, unit_paise }] - validated properly in the service. */
  @IsOptional() @IsArray() items?: unknown[];

  /** The PRACTICE's GST rate, not NUSI's. 0 when they are not registered. */
  @IsOptional() @IsNumber() @Min(0) @Max(100) tax_percent?: number;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  /** Printed at the foot of the invoice. Defaults to the practice's own. */
  @IsOptional() @IsString() @MaxLength(4000) terms?: string;
  @IsOptional() @IsISO8601() due_at?: string;
}

/**
 * The ways a client actually pays a practice. `qr` is its own method and not
 * folded into `upi`: a scanned QR is what the practice remembers doing, and a
 * direct number transfer reconciles against a different line in their bank.
 */
export const PAYMENT_METHODS = [
  'upi', 'bank', 'qr', 'card', 'cash', 'cheque', 'other',
] as const;

class MarkPaidDto {
  @IsOptional() @IsIn(PAYMENT_METHODS) method?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  @IsOptional() @IsISO8601() paid_at?: string;
}

/** One payment that reached the practice. */
class AddPaymentDto {
  /**
   * Paise. Capped at 10 crore so a stray decimal cannot write a number the
   * int column will not hold; the service checks it against what is owed.
   */
  @IsInt() @Min(1) @Max(1_000_000_000) amount_paise!: number;

  /**
   * How the money arrived. Validated here rather than by a CHECK on the
   * column: there is live payment data whose method is free text or NULL, and
   * a constraint strict enough to be worth having would reject it.
   */
  @IsOptional() @IsIn(PAYMENT_METHODS) method?: string;
  /** Their own reference: a UPI ref, a cheque number. */
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** When the money arrived, if not now. */
  @IsOptional() @IsISO8601() received_at?: string;
  /** Which instalment this settles, when there is a schedule. */
  @IsOptional() @IsUUID() instalment_id?: string;
}

class SchedulePartDto {
  @IsInt() @Min(1) @Max(1_000_000_000) amount_paise!: number;
  @IsISO8601() due_at!: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

class SetScheduleDto {
  /** Empty or omitted clears the schedule back to a single payment. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SchedulePartDto)
  parts?: SchedulePartDto[];
}

class ExtendInstalmentDto {
  @IsISO8601() due_at!: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

/**
 * A practice invoicing its own clients.
 *
 * NUSI does not collect this money: the client pays the practice directly and
 * the practice marks the invoice paid here.
 */
@ApiTags('Practice invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@RequireFeature('client_invoicing')
@Controller({ path: 'workspaces/me/invoices', version: '1' })
export class PracticeInvoicesController {
  constructor(
    private readonly invoices: PracticeInvoicesService,
    private readonly clients: ClientsService,
    // `payments_` because `payments` is a route handler on this class.
    private readonly payments_: InvoicePaymentsService,
  ) {}

  private ws(user: AuthUser): string {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return user.workspaceId;
  }

  @Get()
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @ApiOperation({ summary: "Invoices this practice has issued, optionally for one client." })
  async list(@CurrentUser() user: AuthUser, @Query('clientId') clientId?: string) {
    return { data: await this.invoices.list(this.ws(user), clientId || undefined) };
  }

  @Get(':id')
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @ApiOperation({ summary: 'One invoice this practice issued.' })
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.invoices.get(this.ws(user), id) };
  }

  @Post('clients/:clientId')
  @HttpCode(201)
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Create a draft invoice for one client.' })
  async create(
    @CurrentUser() user: AuthUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: SaveInvoiceDto,
  ) {
    const workspaceId = this.ws(user);
    // The client must belong to this practice before anything is written.
    await this.clients.assertClientInWorkspace(workspaceId, clientId);
    return {
      data: await this.invoices.create(workspaceId, clientId, user.id, {
        items: dto.items,
        tax_percent: dto.tax_percent,
        notes: dto.notes,
        due_at: dto.due_at,
        terms: dto.terms,
      }),
    };
  }

  @Patch(':id')
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Edit an invoice. Only a voided one is closed.' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveInvoiceDto,
  ) {
    return { data: await this.invoices.update(this.ws(user), id, dto) };
  }

  @Post(':id/send')
  @HttpCode(200)
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Issue the invoice; the client can see it from now on.' })
  async send(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.invoices.send(this.ws(user), id) };
  }

  @Post(':id/paid')
  @HttpCode(200)
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Record that the client paid the practice directly.' })
  async markPaid(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaidDto,
  ) {
    return { data: await this.invoices.markPaid(this.ws(user), id, dto) };
  }

  @Post(':id/unpaid')
  @HttpCode(200)
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Undo a payment recorded by mistake; back to sent.' })
  async unmarkPaid(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.invoices.unmarkPaid(this.ws(user), id) };
  }

  @Post(':id/void')
  @HttpCode(200)
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Cancel an invoice. Kept, never deleted.' })
  async voidInvoice(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.invoices.void(this.ws(user), id) };
  }

  // ── Part-payments ──────────────────────────────────────────────────

  @Get(':id/payments')
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @ApiOperation({ summary: 'Every payment recorded against this invoice.' })
  async payments(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.payments_.listPayments(this.ws(user), id) };
  }

  @Post(':id/payments')
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Record money received. Settles the invoice once it covers the total.' })
  async addPayment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPaymentDto,
  ) {
    const payment = await this.payments_.addPayment(this.ws(user), id, user.id, dto);
    // The invoice too: recording a payment can settle it, and the caller
    // should not have to re-fetch to find out whether it did.
    return {
      data: { payment, invoice: await this.invoices.get(this.ws(user), id) },
    };
  }

  @Post(':id/payments/:paymentId/delete')
  @HttpCode(200)
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Remove a payment entered by mistake; reopens the invoice if it no longer covers the total.' })
  async removePayment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    await this.payments_.deletePayment(this.ws(user), id, paymentId);
    return { data: await this.invoices.get(this.ws(user), id) };
  }

  // ── Instalments (EMI) ──────────────────────────────────────────────

  @Get(':id/instalments')
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @ApiOperation({ summary: 'The EMI schedule on this invoice, with what is paid against each part.' })
  async instalments(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.payments_.listInstalments(this.ws(user), id) };
  }

  @Post(':id/instalments')
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Set the EMI schedule. The parts must add up to the invoice total; send none to clear it.' })
  async setSchedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetScheduleDto,
  ) {
    return {
      data: await this.payments_.setSchedule(this.ws(user), id, dto.parts ?? []),
    };
  }

  @Patch(':id/instalments/:instalmentId')
  @WorkspaceRole('owner', 'manager', 'nutritionist')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Give one instalment more time, keeping the originally agreed date on record.' })
  async extendInstalment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('instalmentId', ParseUUIDPipe) instalmentId: string,
    @Body() dto: ExtendInstalmentDto,
  ) {
    return {
      data: await this.payments_.extendInstalment(
        this.ws(user), id, instalmentId, dto.due_at, dto.note,
      ),
    };
  }
}
