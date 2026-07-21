import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Archive,
  Check,
  Package,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { Glass, fadeUp, stagger } from '@/design-system';
import {
  storeApi,
  inr,
  type Product,
  type ProductInput,
  type ProductKind,
  type ProductStatus,
} from '@/modules/workspace/api/store';
import { cn } from '@/lib/utils';

const KINDS: Array<{ value: ProductKind; label: string }> = [
  { value: 'physical', label: 'Physical' },
  { value: 'digital', label: 'Digital' },
  { value: 'service', label: 'Service' },
];

/**
 * Owner product store: manage the catalog clients buy from, and work the order
 * book. Orders only reach 'paid' via the Razorpay webhook, so anything stuck on
 * 'pending' is an abandoned checkout, not money owed.
 */
export default function OwnerProducts() {
  const ws = readWorkspace();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'catalog' | 'orders'>('catalog');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  const productsQ = useQuery({
    queryKey: ['products', 'list'],
    queryFn: () => storeApi.list(true),
  });
  const ordersQ = useQuery({
    queryKey: ['products', 'orders'],
    queryFn: () => storeApi.orders(),
  });

  const saveMut = useMutation({
    mutationFn: (input: { id?: string; body: ProductInput }) =>
      input.id ? storeApi.update(input.id, input.body) : storeApi.create(input.body),
    onSuccess: (_p, vars) => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(vars.id ? 'Product updated.' : 'Product created.');
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not save the product.'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => storeApi.remove(id),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(res.archived ? 'Product archived (it has orders).' : 'Product deleted.');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not remove the product.'),
  });

  const publishMut = useMutation({
    mutationFn: (p: Product) =>
      storeApi.update(p.id, { status: p.status === 'published' ? 'draft' : 'published' }),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(p.status === 'published' ? 'Published — clients can buy it now.' : 'Moved to draft.');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not change status.'),
  });

  const fulfilMut = useMutation({
    mutationFn: (id: string) => storeApi.fulfil(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products', 'orders'] });
      toast.success('Marked as delivered.');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not update the order.'),
  });

  const products = productsQ.data ?? [];
  const orders = ordersQ.data ?? [];
  const paidOrders = orders.filter((o) => o.status === 'paid' || o.status === 'fulfilled');
  const revenuePaise = paidOrders.reduce((sum, o) => sum + o.amount_paise, 0);

  return (
    <OwnerLayout
      practiceName={ws.practiceName}
      ownerName={ws.ownerName}
      initials={ws.initials}
      trialDaysLeft={null}
      topbarContext="Products"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          <motion.div variants={fadeUp}>
            <PageHeader
              eyebrow="Workspace · Store"
              title="Products"
              description="Sell supplements, plans and sessions to your clients. They pay in the app; you get notified instantly."
              action={
                <button
                  type="button"
                  onClick={() => setEditing('new')}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
                >
                  <Plus className="h-4 w-4" /> New product
                </button>
              }
            />
          </motion.div>

          {/* KPIs */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Live products" value={String(products.filter((p) => p.status === 'published').length)} />
            <Stat label="Paid orders" value={String(paidOrders.length)} />
            <Stat label="Revenue" value={inr(revenuePaise)} />
          </motion.div>

          {/* Tabs */}
          <motion.div variants={fadeUp} className="flex gap-1 rounded-full bg-foreground/[0.04] p-1">
            {(['catalog', 'orders'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors',
                  tab === t ? 'bg-canvas shadow-sm' : 'text-foreground/60 hover:text-foreground',
                )}
              >
                {t === 'orders' ? `Orders${orders.length ? ` (${orders.length})` : ''}` : 'Catalog'}
              </button>
            ))}
          </motion.div>

          {tab === 'catalog' ? (
            <motion.div variants={fadeUp}>
              {productsQ.isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Glass key={i} className="h-24 animate-pulse" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <Glass className="flex flex-col items-center gap-2 p-12 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-foreground/[0.05]">
                    <ShoppingBag className="h-5 w-5 text-foreground/50" />
                  </span>
                  <div className="mt-1 text-sm font-medium">No products yet</div>
                  <p className="max-w-sm text-xs text-foreground/55">
                    Add your first product — a supplement pack, a printed meal plan, or a one-off consult.
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditing('new')}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-foreground/15 px-4 py-2 text-sm transition-colors hover:bg-foreground/[0.05]"
                  >
                    <Plus className="h-4 w-4" /> New product
                  </button>
                </Glass>
              ) : (
                <div className="space-y-3">
                  {products.map((p) => (
                    <Glass key={p.id} className="flex items-center gap-4 p-4">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.14)] to-[hsl(var(--brand-magenta)_/_0.14)]">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="grid h-full w-full place-items-center">
                            <Package className="h-5 w-5 text-foreground/30" />
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{p.name}</span>
                          <StatusPill status={p.status} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-foreground/50">
                          <span className="capitalize">{p.kind}</span>
                          <span>{inr(p.price_paise)}</span>
                          <span>
                            {p.stock_quantity === null ? 'Unlimited stock' : `${p.stock_quantity} in stock`}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => publishMut.mutate(p)}
                          disabled={p.status === 'archived' || publishMut.isPending}
                          title={p.status === 'published' ? 'Move to draft' : 'Publish'}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/[0.06] disabled:opacity-40"
                        >
                          {p.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>
                        <IconBtn label="Edit" onClick={() => setEditing(p)}>
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          label="Delete"
                          onClick={() => {
                            if (confirm(`Remove “${p.name}”?`)) deleteMut.mutate(p.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </Glass>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div variants={fadeUp}>
              {orders.length === 0 ? (
                <Glass className="p-12 text-center text-sm text-foreground/60">
                  No orders yet. They’ll appear here the moment a client buys something.
                </Glass>
              ) : (
                <Glass className="divide-y divide-foreground/[0.06] p-0">
                  {orders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {o.product_name}
                          {o.quantity > 1 && (
                            <span className="ml-1.5 text-xs text-foreground/50">x{o.quantity}</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-foreground/45">
                          {o.client_name ?? 'Client'} ·{' '}
                          {new Date(o.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">{inr(o.amount_paise)}</span>
                        <OrderPill status={o.status} />
                        {o.status === 'paid' && (
                          <button
                            type="button"
                            onClick={() => fulfilMut.mutate(o.id)}
                            disabled={fulfilMut.isPending}
                            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-foreground/[0.05] disabled:opacity-50"
                          >
                            <Truck className="h-3.5 w-3.5" /> Mark delivered
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </Glass>
              )}
            </motion.div>
          )}
        </motion.div>
      </div>

      {editing && (
        <ProductFormModal
          product={editing === 'new' ? null : editing}
          saving={saveMut.isPending}
          onClose={() => setEditing(null)}
          onSave={(body) =>
            saveMut.mutate({ id: editing === 'new' ? undefined : editing.id, body })
          }
        />
      )}
    </OwnerLayout>
  );
}

/* ------------------------------------------------------------------ bits --- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Glass className="p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </Glass>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: ProductStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
        status === 'published' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        status === 'draft' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
        status === 'archived' && 'bg-foreground/[0.07] text-foreground/50',
      )}
    >
      {status === 'archived' && <Archive className="h-2.5 w-2.5" />}
      {status}
    </span>
  );
}

function OrderPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold',
        status === 'fulfilled' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        status === 'paid' && 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
        status === 'pending' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
        (status === 'failed' || status === 'cancelled') && 'bg-foreground/[0.06] text-foreground/50',
      )}
    >
      {status === 'fulfilled' && <Check className="h-3 w-3" />}
      {status}
    </span>
  );
}

/** Create/edit form. Price is typed in rupees and stored as paise. */
function ProductFormModal({
  product,
  saving,
  onClose,
  onSave,
}: {
  product: Product | null;
  saving: boolean;
  onClose: () => void;
  onSave: (body: ProductInput) => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [kind, setKind] = useState<ProductKind>(product?.kind ?? 'physical');
  const [rupees, setRupees] = useState(product ? String(Math.round(product.price_paise / 100)) : '');
  const [compareRupees, setCompareRupees] = useState(
    product?.compare_at_paise != null ? String(Math.round(product.compare_at_paise / 100)) : '',
  );
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? '');
  const [stock, setStock] = useState(
    product?.stock_quantity != null ? String(product.stock_quantity) : '',
  );
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? 'draft');

  const priceNum = Number(rupees);
  const valid = name.trim().length >= 2 && Number.isFinite(priceNum) && priceNum > 0;

  function submit() {
    if (!valid) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      kind,
      pricePaise: Math.round(priceNum * 100),
      compareAtPaise: compareRupees ? Math.round(Number(compareRupees) * 100) : undefined,
      imageUrl: imageUrl.trim() || undefined,
      stockQuantity: stock.trim() === '' ? undefined : Math.max(0, Math.floor(Number(stock))),
      status,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto"
      >
        <Glass variant="heavy" className="overflow-hidden p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
            <h2 className="text-sm font-semibold">{product ? 'Edit product' : 'New product'}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.06]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Whey protein — 1kg"
                className={inputCls}
              />
            </Field>

            <Field label="Description" hint="Optional">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What the client gets, dosage, delivery time…"
                className={cn(inputCls, 'resize-none')}
              />
            </Field>

            <Field label="Type">
              <div className="flex gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={cn(
                      'flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors',
                      kind === k.value
                        ? 'border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                        : 'border-foreground/10 text-foreground/60 hover:bg-foreground/[0.04]',
                    )}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (₹)">
                <input
                  value={rupees}
                  onChange={(e) => setRupees(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                  placeholder="1499"
                  className={inputCls}
                />
              </Field>
              <Field label="Compare at (₹)" hint="Optional">
                <input
                  value={compareRupees}
                  onChange={(e) => setCompareRupees(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                  placeholder="1999"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Stock" hint="Leave empty for unlimited">
              <input
                value={stock}
                onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="Unlimited"
                className={inputCls}
              />
            </Field>

            <Field label="Image URL" hint="Optional">
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
                className={inputCls}
              />
            </Field>

            <Field label="Visibility">
              <div className="flex gap-2">
                {(['draft', 'published'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      'flex-1 rounded-xl border px-3 py-2 text-xs font-medium capitalize transition-colors',
                      status === s
                        ? 'border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                        : 'border-foreground/10 text-foreground/60 hover:bg-foreground/[0.04]',
                    )}
                  >
                    {s === 'published' ? 'Published (clients see it)' : 'Draft'}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm text-foreground/70 transition-colors hover:bg-foreground/[0.06]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!valid || saving}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50"
            >
              {saving ? 'Saving…' : product ? 'Save changes' : 'Create product'}
            </button>
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-foreground/10 bg-canvas px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/35 focus:border-teal-500/50';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2 text-xs font-medium text-foreground/70">
        {label}
        {hint && <span className="text-[10px] font-normal text-foreground/40">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

interface WS {
  practiceName: string;
  ownerName: string;
  initials: string;
}
function readWorkspace(): WS {
  let practiceName = 'Your Practice';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch {
    /* ignore */
  }
  const initials =
    practiceName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
