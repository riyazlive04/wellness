import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RazorpayService } from '../billing/razorpay.service';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto';

/**
 * Product store: a workspace sells things to its own clients.
 *
 * Money is paise integers end to end. The `*_paise` columns are bigint in
 * Postgres, which Prisma hands back as a JS BigInt — and `JSON.stringify` throws
 * on BigInt. So every SELECT casts them with `::int` (max ≈ ₹2.1 crore, far above
 * any real product) to keep responses serialisable.
 */
export interface ProductRow {
  id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  description: string | null;
  kind: 'physical' | 'digital' | 'service';
  price_paise: number;
  compare_at_paise: number | null;
  currency: string;
  image_url: string | null;
  status: 'draft' | 'published' | 'archived';
  stock_quantity: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProductOrderRow {
  id: string;
  workspace_id: string;
  product_id: string;
  client_id: string | null;
  quantity: number;
  product_name: string;
  unit_price_paise: number;
  amount_paise: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'fulfilled';
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  created_at: Date;
  paid_at: Date | null;
  fulfilled_at: Date | null;
}

/** Columns every product read returns, with bigints made JSON-safe. */
const PRODUCT_COLS = `
  id, workspace_id, created_by, name, description, kind,
  price_paise::int      AS price_paise,
  compare_at_paise::int AS compare_at_paise,
  currency, image_url, status, stock_quantity, created_at, updated_at`;

const ORDER_COLS = `
  id, workspace_id, product_id, client_id, quantity, product_name,
  unit_price_paise::int AS unit_price_paise,
  amount_paise::int     AS amount_paise,
  currency, status, razorpay_order_id, razorpay_payment_id,
  created_at, paid_at, fulfilled_at`;

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
  ) {}

  assertWorkspace(workspaceId: string | null): string {
    if (!workspaceId) throw new ForbiddenException('Not in a workspace.');
    return workspaceId;
  }

  // ---------------------------------------------------------------- owner ---

  async listProducts(workspaceId: string, includeArchived = false): Promise<ProductRow[]> {
    return this.prisma.$queryRawUnsafe<ProductRow[]>(
      `SELECT ${PRODUCT_COLS}
         FROM public.products
        WHERE workspace_id = $1::uuid
          AND ($2::boolean OR status <> 'archived')
        ORDER BY created_at DESC`,
      workspaceId,
      includeArchived,
    );
  }

  async createProduct(workspaceId: string, userId: string, dto: CreateProductDto): Promise<ProductRow> {
    const [row] = await this.prisma.$queryRawUnsafe<ProductRow[]>(
      `INSERT INTO public.products
         (workspace_id, created_by, name, description, kind, price_paise,
          compare_at_paise, image_url, status, stock_quantity)
       VALUES ($1::uuid, $2::uuid, $3, $4, COALESCE($5,'physical'), $6,
               $7, $8, COALESCE($9,'draft'), $10)
       RETURNING ${PRODUCT_COLS}`,
      workspaceId,
      userId,
      dto.name.trim(),
      dto.description?.trim() || null,
      dto.kind ?? null,
      dto.pricePaise,
      dto.compareAtPaise ?? null,
      dto.imageUrl?.trim() || null,
      dto.status ?? null,
      dto.stockQuantity ?? null,
    );
    return row;
  }

  async updateProduct(workspaceId: string, id: string, dto: UpdateProductDto): Promise<ProductRow> {
    // COALESCE keeps every omitted field untouched, so PATCH stays partial.
    const [row] = await this.prisma.$queryRawUnsafe<ProductRow[]>(
      `UPDATE public.products SET
         name             = COALESCE($3, name),
         description      = COALESCE($4, description),
         kind             = COALESCE($5, kind),
         price_paise      = COALESCE($6, price_paise),
         compare_at_paise = COALESCE($7, compare_at_paise),
         image_url        = COALESCE($8, image_url),
         status           = COALESCE($9, status),
         stock_quantity   = COALESCE($10, stock_quantity),
         updated_at       = now()
       WHERE id = $1::uuid AND workspace_id = $2::uuid
       RETURNING ${PRODUCT_COLS}`,
      id,
      workspaceId,
      dto.name?.trim() ?? null,
      dto.description?.trim() ?? null,
      dto.kind ?? null,
      dto.pricePaise ?? null,
      dto.compareAtPaise ?? null,
      dto.imageUrl?.trim() ?? null,
      dto.status ?? null,
      dto.stockQuantity ?? null,
    );
    if (!row) throw new NotFoundException('Product not found');
    return row;
  }

  /**
   * Delete when nothing has ever been bought; archive once it has.
   *
   * product_orders.product_id is ON DELETE RESTRICT precisely so paid history
   * can't be erased — archiving hides it from the storefront instead.
   */
  async removeProduct(workspaceId: string, id: string): Promise<{ id: string; archived: boolean }> {
    const [{ count }] = await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM public.product_orders
        WHERE product_id = $1::uuid AND workspace_id = $2::uuid`,
      id,
      workspaceId,
    );

    if (count > 0) {
      const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE public.products SET status = 'archived', updated_at = now()
          WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING id`,
        id,
        workspaceId,
      );
      if (!row) throw new NotFoundException('Product not found');
      return { id: row.id, archived: true };
    }

    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.products WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING id`,
      id,
      workspaceId,
    );
    if (!row) throw new NotFoundException('Product not found');
    return { id: row.id, archived: false };
  }

  /** Owner's order book. Pending rows are shown too so abandoned carts are visible. */
  async listOrders(workspaceId: string): Promise<Array<ProductOrderRow & { client_name: string | null }>> {
    return this.prisma.$queryRawUnsafe<Array<ProductOrderRow & { client_name: string | null }>>(
      `SELECT o.id, o.workspace_id, o.product_id, o.client_id, o.quantity, o.product_name,
              o.unit_price_paise::int AS unit_price_paise,
              o.amount_paise::int     AS amount_paise,
              o.currency, o.status, o.razorpay_order_id, o.razorpay_payment_id,
              o.created_at, o.paid_at, o.fulfilled_at,
              c.name AS client_name
         FROM public.product_orders o
         LEFT JOIN public.clients c ON c.id = o.client_id
        WHERE o.workspace_id = $1::uuid
        ORDER BY o.created_at DESC
        LIMIT 200`,
      workspaceId,
    );
  }

  /** Owner marks a paid order as delivered/handed over. */
  async fulfilOrder(workspaceId: string, orderId: string): Promise<ProductOrderRow> {
    const [row] = await this.prisma.$queryRawUnsafe<ProductOrderRow[]>(
      `UPDATE public.product_orders
          SET status = 'fulfilled', fulfilled_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND status = 'paid'
        RETURNING ${ORDER_COLS}`,
      orderId,
      workspaceId,
    );
    if (!row) throw new NotFoundException('No paid order to fulfil.');
    return row;
  }

  // --------------------------------------------------------------- client ---

  /** Resolve the caller's client row — this is what scopes them to a workspace. */
  private async requireClient(userId: string): Promise<{ id: string; workspace_id: string; name: string }> {
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string; name: string }>>(
      `SELECT id, workspace_id, name FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');
    return me;
  }

  /** The storefront: published products belonging to the client's own workspace. */
  async listStorefront(userId: string): Promise<ProductRow[]> {
    const me = await this.requireClient(userId);
    return this.prisma.$queryRawUnsafe<ProductRow[]>(
      `SELECT ${PRODUCT_COLS}
         FROM public.products
        WHERE workspace_id = $1::uuid AND status = 'published'
        ORDER BY created_at DESC`,
      me.workspace_id,
    );
  }

  async myOrders(userId: string): Promise<ProductOrderRow[]> {
    const me = await this.requireClient(userId);
    return this.prisma.$queryRawUnsafe<ProductOrderRow[]>(
      // Fulfilment is async (the webhook flips 'pending' → 'paid' a beat after
      // checkout), so a just-placed order must still be visible as "Processing".
      // The 15-minute window does that without leaving abandoned Razorpay modals
      // sitting in the client's history forever.
      `SELECT ${ORDER_COLS}
         FROM public.product_orders
        WHERE client_id = $1::uuid
          AND (status <> 'pending' OR created_at > now() - interval '15 minutes')
        ORDER BY created_at DESC
        LIMIT 100`,
      me.id,
    );
  }

  /**
   * Start a purchase: write a PENDING order, then open a Razorpay order for it.
   *
   * The pending row is created first so the webhook always has a row to find,
   * even if the browser dies mid-checkout. Nothing is delivered here — only the
   * webhook flips the row to paid (see markOrderPaidFromWebhook).
   */
  async startCheckout(
    userId: string,
    email: string | undefined,
    dto: { productId: string; quantity?: number },
  ) {
    const me = await this.requireClient(userId);
    const qty = Math.min(99, Math.max(1, Math.floor(dto.quantity ?? 1)));

    const [product] = await this.prisma.$queryRawUnsafe<ProductRow[]>(
      `SELECT ${PRODUCT_COLS} FROM public.products
        WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      dto.productId,
      me.workspace_id,
    );
    if (!product) throw new NotFoundException('Product not found');
    if (product.status !== 'published') throw new BadRequestException('This product is not available.');
    if (product.price_paise <= 0) throw new BadRequestException('This product has no price set.');
    if (product.stock_quantity !== null && product.stock_quantity < qty) {
      throw new BadRequestException(
        product.stock_quantity === 0 ? 'Out of stock.' : `Only ${product.stock_quantity} left in stock.`,
      );
    }

    const amountPaise = product.price_paise * qty;

    const [order] = await this.prisma.$queryRawUnsafe<ProductOrderRow[]>(
      `INSERT INTO public.product_orders
         (workspace_id, product_id, client_id, user_id, quantity, product_name,
          unit_price_paise, amount_paise, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, 'pending')
       RETURNING ${ORDER_COLS}`,
      me.workspace_id,
      product.id,
      me.id,
      userId,
      qty,
      product.name,
      product.price_paise,
      amountPaise,
    );

    // `notes` is how the webhook attributes the payment back to this row.
    const rzp = await this.razorpay.createOrder({
      amountPaise,
      receipt: `prod-${order.id.slice(0, 8)}-${Date.now()}`,
      notes: {
        workspace_id: me.workspace_id,
        kind: 'product',
        product_order_id: order.id,
        product_id: product.id,
        client_id: me.id,
        user_email: email ?? '',
      },
    });

    await this.prisma.$queryRawUnsafe(
      `UPDATE public.product_orders SET razorpay_order_id = $1 WHERE id = $2::uuid`,
      rzp.id,
      order.id,
    );

    return {
      productOrderId: order.id,
      orderId: rzp.id,
      amountPaise,
      currency: 'INR',
      razorpayKeyId: this.razorpay.keyId,
      product: { id: product.id, name: product.name, kind: product.kind },
      quantity: qty,
    };
  }

  /**
   * Signature check only — deliberately does NOT mark the order paid.
   *
   * Same rule as billing's verify endpoint: the webhook owns fulfilment, so a
   * forged client call can't deliver a product.
   */
  verifyPayment(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): { verified: true } {
    this.razorpay.verifyPaymentSignature(params);
    return { verified: true };
  }

}
