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
import { IsArray, IsIn, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClientsService } from './clients.service';
import { PracticeInvoicesService } from './practice-invoices.service';

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

class MarkPaidDto {
  @IsOptional() @IsIn(['upi', 'cash', 'bank', 'card', 'other']) method?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  @IsOptional() @IsISO8601() paid_at?: string;
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
}
