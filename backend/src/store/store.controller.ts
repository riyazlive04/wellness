import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import type { AuthUser, WorkspaceMemberRole } from '../auth/types/auth-user.type';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { StoreService } from './store.service';

/**
 * Every workspace staff role.
 *
 * These reads MUST carry a role decorator. A client also has a `workspaceId`
 * (jwt.strategy resolves clients.workspace_id), and RolesGuard lets a route
 * through when it declares no roles — so an undecorated read here was reachable
 * by clients, exposing draft products and the whole order book (other clients'
 * names and purchases). Clients are never workspace_members, so their
 * workspaceRole is null and requiring any staff role keeps them out.
 */
const STAFF: WorkspaceMemberRole[] = [
  'owner',
  'nutritionist',
  'assistant_nutritionist',
  'receptionist',
  'coach',
  'support',
];

/**
 * Owner-side catalog management. Clients never touch these routes — their
 * storefront lives on StoreClientController (`/me/store/*`).
 */
@ApiTags('store')
@Controller({ path: 'workspaces/me/products', version: '1' })
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get()
  @WorkspaceRole(...STAFF)
  @ApiOperation({ summary: 'List the workspace product catalog.' })
  async list(@CurrentUser() u: AuthUser, @Query('includeArchived') includeArchived?: string) {
    return {
      data: await this.store.listProducts(
        this.store.assertWorkspace(u.workspaceId),
        includeArchived === 'true',
      ),
    };
  }

  @Post()
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a product.' })
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateProductDto) {
    return {
      data: await this.store.createProduct(this.store.assertWorkspace(u.workspaceId), u.id, dto),
    };
  }

  @Patch(':id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Update a product.' })
  async update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return {
      data: await this.store.updateProduct(this.store.assertWorkspace(u.workspaceId), id, dto),
    };
  }

  @Delete(':id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Delete a product (archived instead if it has orders).' })
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.store.removeProduct(this.store.assertWorkspace(u.workspaceId), id) };
  }

  @Get('orders/all')
  @WorkspaceRole(...STAFF)
  @ApiOperation({ summary: 'List product orders placed by clients.' })
  async orders(@CurrentUser() u: AuthUser) {
    return { data: await this.store.listOrders(this.store.assertWorkspace(u.workspaceId)) };
  }

  @Post('orders/:id/fulfil')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a paid order as delivered.' })
  async fulfil(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return { data: await this.store.fulfilOrder(this.store.assertWorkspace(u.workspaceId), id) };
  }
}
