import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
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

/**
 * Columns every product read returns, with bigints made JSON-safe.
 *
 * float8 rather than int: `::int` overflows at 2,147,483,647 paise (₹21.47L),
 * so a large order total threw "integer out of range" on the RETURNING cast.
 * These are whole paise far below 2^53, so a double represents them exactly.
 */
const PRODUCT_COLS = `
  id, workspace_id, created_by, name, description, kind,
  price_paise::float8      AS price_paise,
  compare_at_paise::float8 AS compare_at_paise,
  currency, image_url, status, stock_quantity, created_at, updated_at`;

const ORDER_COLS = `
  id, workspace_id, product_id, client_id, quantity, product_name,
  unit_price_paise::float8 AS unit_price_paise,
  amount_paise::float8     AS amount_paise,
  currency, status, razorpay_order_id, razorpay_payment_id,
  created_at, paid_at, fulfilled_at`;

/**
 * How long a started-but-unpaid checkout holds stock. Also the window in which
 * a repeated Buy click resumes the same order instead of creating another.
 */
const PENDING_WINDOW = `15 minutes`;

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

  /**
   * Partial update built from the keys actually present on the DTO.
   *
   * Deliberately NOT `COALESCE($n, existing)`: that treats "clear this field"
   * and "leave this field alone" as the same thing, so removing a photo,
   * description or compare-at price silently restored the old value, and a
   * product with tracked stock could never go back to unlimited. Here an absent
   * key is skipped entirely and an explicit null writes NULL.
   */
  async updateProduct(workspaceId: string, id: string, dto: UpdateProductDto): Promise<ProductRow> {
    const sets: string[] = [];
    const params: unknown[] = [id, workspaceId];
    const set = (column: string, value: unknown, cast = '') => {
      params.push(value);
      sets.push(`${column} = $${params.length}${cast}`);
    };

    if (dto.name !== undefined) set('name', dto.name.trim());
    if (dto.description !== undefined) set('description', dto.description?.trim() || null);
    if (dto.kind !== undefined) set('kind', dto.kind);
    if (dto.pricePaise !== undefined) set('price_paise', dto.pricePaise);
    if (dto.compareAtPaise !== undefined) set('compare_at_paise', dto.compareAtPaise);
    if (dto.imageUrl !== undefined) set('image_url', dto.imageUrl?.trim() || null);
    if (dto.status !== undefined) set('status', dto.status);
    // null is meaningful here: unlimited stock.
    if (dto.stockQuantity !== undefined) set('stock_quantity', dto.stockQuantity, '::int');

    if (!sets.length) {
      const [current] = await this.prisma.$queryRawUnsafe<ProductRow[]>(
        `SELECT ${PRODUCT_COLS} FROM public.products
          WHERE id = $1::uuid AND workspace_id = $2::uuid`,
        id,
        workspaceId,
      );
      if (!current) throw new NotFoundException('Product not found');
      return current;
    }

    const [row] = await this.prisma.$queryRawUnsafe<ProductRow[]>(
      `UPDATE public.products
          SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid
        RETURNING ${PRODUCT_COLS}`,
      ...params,
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
   * webhook flips the row to paid (see fulfilProductOrder in the webhook).
   */
  async startCheckout(
    userId: string,
    email: string | undefined,
    dto: { productId: string; quantity?: number },
  ) {
    // Fail before writing anything, so a workspace without payments configured
    // can't leave a trail of pending orders that will never be payable.
    if (!this.razorpay.isConfigured()) {
      throw new ServiceUnavailableException(
        'Payments are not set up for this practice yet.',
      );
    }

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

    const amountPaise = product.price_paise * qty;

    // Resume an in-flight checkout rather than stacking duplicates: clicking Buy
    // again (or dismissing and retrying) reuses the same order and the same
    // Razorpay order. Only while the price still matches — otherwise the client
    // would be charged the old amount after a price change.
    const [existing] = await this.prisma.$queryRawUnsafe<ProductOrderRow[]>(
      `SELECT ${ORDER_COLS} FROM public.product_orders
        WHERE client_id = $1::uuid AND product_id = $2::uuid
          AND status = 'pending' AND quantity = $3
          AND unit_price_paise = $4
          AND razorpay_order_id IS NOT NULL
          AND created_at > now() - interval '${PENDING_WINDOW}'
        ORDER BY created_at DESC LIMIT 1`,
      me.id,
      product.id,
      qty,
      product.price_paise,
    );
    if (existing) {
      return {
        productOrderId: existing.id,
        orderId: existing.razorpay_order_id as string,
        amountPaise: existing.amount_paise,
        currency: 'INR',
        razorpayKeyId: this.razorpay.keyId,
        product: { id: product.id, name: product.name, kind: product.kind },
        quantity: qty,
      };
    }

    // Availability and the INSERT happen in ONE statement so two clients racing
    // for the last unit can't both succeed. Stock in flight counts too: each
    // client's most recent unpaid checkout (within PENDING_WINDOW) holds its
    // quantity, via DISTINCT ON so one client's repeated attempts reserve once.
    const [order] = await this.prisma.$queryRawUnsafe<ProductOrderRow[]>(
      `INSERT INTO public.product_orders
         (workspace_id, product_id, client_id, user_id, quantity, product_name,
          unit_price_paise, amount_paise, status)
       SELECT $1::uuid, p.id, $3::uuid, $4::uuid, $5, p.name, p.price_paise, $6, 'pending'
         FROM public.products p
        WHERE p.id = $2::uuid
          AND p.workspace_id = $1::uuid
          AND p.status = 'published'
          AND (
            p.stock_quantity IS NULL
            OR p.stock_quantity - COALESCE((
                 SELECT SUM(r.quantity) FROM (
                   SELECT DISTINCT ON (o.client_id) o.quantity
                     FROM public.product_orders o
                    WHERE o.product_id = p.id
                      AND o.status = 'pending'
                      AND o.created_at > now() - interval '${PENDING_WINDOW}'
                    ORDER BY o.client_id, o.created_at DESC
                 ) r
               ), 0) >= $5
          )
       RETURNING ${ORDER_COLS}`,
      me.workspace_id,
      product.id,
      me.id,
      userId,
      qty,
      amountPaise,
    );
    if (!order) {
      const left = product.stock_quantity ?? 0;
      throw new BadRequestException(
        left <= 0 ? 'Out of stock.' : `Only ${left} left in stock — and some are in other carts right now.`,
      );
    }

    // `notes` is how the webhook attributes the payment back to this row.
    let rzp: { id: string };
    try {
      rzp = await this.razorpay.createOrder({
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
    } catch (err) {
      // Nothing can ever be paid against this row now — release its held stock
      // instead of leaving it to expire.
      await this.prisma
        .$queryRawUnsafe(
          `UPDATE public.product_orders SET status = 'cancelled' WHERE id = $1::uuid AND status = 'pending'`,
          order.id,
        )
        .catch(() => undefined);
      throw err;
    }

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
