import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Archive,
  Check,
  ImagePlus,
  Loader2,
  Package,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  TrendingUp,
  Truck,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useScope } from '@/hooks/useScope';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { NutritionTabs } from '@/modules/workspace/components/NutritionTabs';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { fadeUp, stagger } from '@/design-system';
import {
  storeApi,
  inr,
  type Product,
  type ProductInput,
  type ProductKind,
  type ProductOrder,
  type ProductStatus,
} from '@/modules/workspace/api/store';
import { optimistic } from '@/lib/optimistic';
import { cn } from '@/lib/utils';
import i18n from '@/i18n';

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
  const { t } = useTranslation('ownerProducts');
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
      toast.success(vars.id ? t('toast.productUpdated') : t('toast.productCreated'));
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message ?? t('toast.saveFailed')),
  });

  // Optimistic: the row vanishes instantly. onSuccess still runs the image
  // cleanup + toast; onSettled refetch brings it back as 'archived' if the API
  // archived it (has orders) rather than hard-deleting.
  const deleteMut = useMutation({
    mutationFn: (p: Product) => storeApi.remove(p.id).then((res) => ({ res, product: p })),
    ...optimistic<Product[], Product>(
      qc,
      ['products', 'list'],
      (old, p) => old.filter((x) => x.id !== p.id),
      { errorMessage: t('toast.removeFailed') },
    ),
    onSuccess: ({ res, product }) => {
      // Only when the row is really gone — an archived product still shows its
      // photo in the catalog and in past orders.
      if (!res.archived) void deleteStoredImage(product.image_url);
      toast.success(res.archived ? t('toast.productArchived') : t('toast.productDeleted'));
    },
  });

  // Optimistic: the status pill + Publish/Unpublish label flip instantly.
  const publishMut = useMutation({
    mutationFn: (p: Product) =>
      storeApi.update(p.id, { status: p.status === 'published' ? 'draft' : 'published' }),
    ...optimistic<Product[], Product>(
      qc,
      ['products', 'list'],
      (old, p) =>
        old.map((x) =>
          x.id === p.id ? { ...x, status: x.status === 'published' ? 'draft' : 'published' } : x,
        ),
      { errorMessage: t('toast.statusFailed') },
    ),
    onSuccess: (p) => {
      toast.success(p.status === 'published' ? t('toast.published') : t('toast.movedToDraft'));
    },
  });

  // Optimistic: the order flips to 'fulfilled' instantly.
  const fulfilMut = useMutation({
    mutationFn: (id: string) => storeApi.fulfil(id),
    ...optimistic<ProductOrder[], string>(
      qc,
      ['products', 'orders'],
      (old, id) => old.map((o) => (o.id === id ? { ...o, status: 'fulfilled' } : o)),
      { errorMessage: t('toast.orderFailed') },
    ),
    onSuccess: () => {
      toast.success(t('toast.markedDelivered'));
    },
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
      topbarContext={t('topbar')}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <NutritionTabs />
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          <motion.div variants={fadeUp}>
            <PageHeader
              eyebrow={t('header.eyebrow')}
              title={t('header.title')}
              description={t('header.description')}
              action={
                <button
                  type="button"
                  onClick={() => setEditing('new')}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
                >
                  <Plus className="h-4 w-4" /> {t('header.newProduct')}
                </button>
              }
            />
          </motion.div>

          {/* KPIs */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat tint="teal" icon={Package} label={t('stats.liveProducts')} value={String(products.filter((p) => p.status === 'published').length)} />
            <Stat tint="sky" icon={ShoppingBag} label={t('stats.paidOrders')} value={String(paidOrders.length)} />
            <Stat tint="emerald" icon={TrendingUp} label={t('stats.revenue')} value={inr(revenuePaise)} />
          </motion.div>

          {/* Tabs */}
          <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-1.5">
            {(['catalog', 'orders'] as const).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setTab(tabKey)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold capitalize transition-colors',
                  tab === tabKey
                    ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm'
                    : 'text-foreground/55 hover:bg-foreground/[0.05]',
                )}
              >
                {tabKey === 'orders'
                  ? orders.length
                    ? t('tabs.ordersWithCount', { count: orders.length })
                    : t('tabs.orders')
                  : t('tabs.catalog')}
              </button>
            ))}
          </motion.div>

          {tab === 'catalog' ? (
            <motion.div variants={fadeUp}>
              {productsQ.isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl border border-foreground/[0.06] bg-card shadow-sm" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-3xl border border-foreground/[0.06] bg-card p-12 text-center shadow-sm">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-100 text-teal-700 dark:bg-teal-500/[0.12] dark:text-teal-300">
                    <ShoppingBag className="h-6 w-6" />
                  </span>
                  <div className="mt-1 text-sm font-bold">{t('catalog.emptyTitle')}</div>
                  <p className="max-w-sm text-xs text-foreground/55">
                    {t('catalog.emptyBody')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditing('new')}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] cta-glow"
                  >
                    <Plus className="h-4 w-4" /> {t('header.newProduct')}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col gap-4 rounded-2xl border border-foreground/[0.06] bg-card p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--brand-blue))]/30 hover:shadow-[0_18px_40px_-24px_rgba(14,26,36,0.45)] sm:flex-row sm:items-center"
                    >
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.14)] to-[hsl(var(--brand-magenta)_/_0.14)] ring-1 ring-foreground/[0.06]">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="grid h-full w-full place-items-center">
                            <Package className="h-5 w-5 text-foreground/30" />
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold">{p.name}</span>
                          <StatusPill status={p.status} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 font-semibold capitalize text-violet-700 dark:bg-violet-500/[0.12] dark:text-violet-300">
                            {t(`kind.${p.kind}`)}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold tabular-nums text-emerald-700 dark:bg-emerald-500/[0.12] dark:text-emerald-300">
                            {inr(p.price_paise)}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 font-semibold text-sky-700 dark:bg-sky-500/[0.12] dark:text-sky-300">
                            {p.stock_quantity === null ? t('catalog.unlimitedStock') : t('catalog.inStock', { count: p.stock_quantity })}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => publishMut.mutate(p)}
                          disabled={p.status === 'archived'}
                          title={p.status === 'published' ? t('catalog.moveToDraft') : t('catalog.publish')}
                          className="rounded-full border border-foreground/[0.08] px-3.5 py-1.5 text-xs font-bold text-foreground/70 transition-colors hover:border-[hsl(var(--brand-blue))]/30 hover:bg-[hsl(var(--brand-blue))]/[0.06] hover:text-[hsl(var(--brand-blue))] disabled:opacity-40 disabled:hover:border-foreground/[0.08] disabled:hover:bg-transparent disabled:hover:text-foreground/70"
                        >
                          {p.status === 'published' ? t('catalog.unpublish') : t('catalog.publish')}
                        </button>
                        <IconBtn label={t('common:actions.edit')} onClick={() => setEditing(p)}>
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          label={t('common:actions.delete')}
                          onClick={() => {
                            if (confirm(t('catalog.confirmRemove', { name: p.name }))) deleteMut.mutate(p);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div variants={fadeUp}>
              {orders.length === 0 ? (
                <div className="rounded-3xl border border-foreground/[0.06] bg-card p-12 text-center text-sm text-foreground/60 shadow-sm">
                  {t('orders.empty')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-foreground/[0.06] bg-card shadow-sm divide-y divide-foreground/[0.06]">
                  {orders.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-foreground/[0.02]">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">
                          {o.product_name}
                          {o.quantity > 1 && (
                            <span className="ml-1.5 text-xs font-semibold text-foreground/50">x{o.quantity}</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-foreground/45">
                          {o.client_name ?? t('orders.client')} ·{' '}
                          {new Date(o.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-bold tabular-nums">{inr(o.amount_paise)}</span>
                        <OrderPill status={o.status} />
                        {o.status === 'paid' && (
                          <button
                            type="button"
                            onClick={() => fulfilMut.mutate(o.id)}
                            disabled={fulfilMut.isPending}
                            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3.5 py-1.5 text-xs font-bold transition-colors hover:border-[hsl(var(--brand-blue))]/30 hover:bg-[hsl(var(--brand-blue))]/[0.06] hover:text-[hsl(var(--brand-blue))] disabled:opacity-50"
                          >
                            <Truck className="h-3.5 w-3.5" /> {t('orders.markDelivered')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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

const KPI_TINT: Record<string, string> = {
  teal: 'bg-teal-100 text-teal-950 border-teal-200/60 dark:bg-teal-500/[0.12] dark:text-teal-50 dark:border-teal-500/20',
  sky: 'bg-sky-100 text-sky-950 border-sky-200/60 dark:bg-sky-500/[0.12] dark:text-sky-50 dark:border-sky-500/20',
  emerald: 'bg-emerald-100 text-emerald-950 border-emerald-200/60 dark:bg-emerald-500/[0.12] dark:text-emerald-50 dark:border-emerald-500/20',
};

function Stat({
  label,
  value,
  tint = 'teal',
  icon: Icon,
}: {
  label: string;
  value: string;
  tint?: string;
  icon: typeof Package;
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border p-5 shadow-sm', KPI_TINT[tint] ?? KPI_TINT.teal)}>
      <div className="flex items-start justify-between">
        <span className="text-[12px] font-bold opacity-85">{label}</span>
        <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-white/50 dark:bg-black/20">
          <Icon className="h-4 w-4 opacity-85" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-extrabold leading-none tracking-tight tabular-nums">{value}</div>
    </div>
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
      className="grid h-9 w-9 place-items-center rounded-xl border border-foreground/[0.08] text-foreground/60 transition-colors hover:border-[hsl(var(--brand-blue))]/30 hover:bg-[hsl(var(--brand-blue))]/[0.06] hover:text-[hsl(var(--brand-blue))]"
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: ProductStatus }) {
  const { t } = useTranslation('ownerProducts');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]',
        status === 'published' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/[0.15] dark:text-emerald-300',
        status === 'draft' && 'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.15] dark:text-amber-300',
        status === 'archived' && 'bg-foreground/[0.07] text-foreground/50',
      )}
    >
      {status === 'archived' && <Archive className="h-2.5 w-2.5" />}
      {t(`status.${status}`)}
    </span>
  );
}

function OrderPill({ status }: { status: string }) {
  const { t } = useTranslation('ownerProducts');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]',
        status === 'fulfilled' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/[0.15] dark:text-emerald-300',
        status === 'paid' && 'bg-teal-100 text-teal-700 dark:bg-teal-500/[0.15] dark:text-teal-300',
        status === 'pending' && 'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.15] dark:text-amber-300',
        (status === 'failed' || status === 'cancelled') && 'bg-foreground/[0.06] text-foreground/50',
      )}
    >
      {status === 'fulfilled' && <Check className="h-3 w-3" />}
      {t(`orderStatus.${status}`, { defaultValue: status })}
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
  const { t } = useTranslation('ownerProducts');
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
    // null (not undefined) for the emptied fields — that's what actually clears
    // them. Undefined means "leave unchanged", which silently restored the old
    // photo/description/compare price and made unlimited stock unreachable.
    onSave({
      name: name.trim(),
      description: description.trim() || null,
      kind,
      pricePaise: Math.round(priceNum * 100),
      compareAtPaise: compareRupees ? Math.round(Number(compareRupees) * 100) : null,
      imageUrl: imageUrl.trim() || null,
      stockQuantity: stock.trim() === '' ? null : Math.max(0, Math.floor(Number(stock))),
      status,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label={t('common:actions.close')} className="absolute inset-0 cursor-default" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto"
      >
        <div className="overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
            <div>
              <span className="text-[hsl(var(--brand-blue))] text-[10px] font-bold uppercase tracking-[0.18em]">{t('form.eyebrow')}</span>
              <h2 className="text-sm font-extrabold">{product ? t('form.editTitle') : t('form.newTitle')}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common:actions.close')}
              className="grid h-9 w-9 place-items-center rounded-xl border border-foreground/[0.08] text-foreground/60 transition-colors hover:bg-foreground/[0.06]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            <Field label={t('form.nameLabel')}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('form.namePlaceholder')}
                className={inputCls}
              />
            </Field>

            <Field label={t('form.descriptionLabel')} hint={t('common:status.optional')}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={t('form.descriptionPlaceholder')}
                className={cn(inputCls, 'resize-none')}
              />
            </Field>

            <Field label={t('form.typeLabel')}>
              <div className="flex gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={cn(
                      'flex-1 rounded-full border px-3 py-2 text-xs font-bold transition-colors',
                      kind === k.value
                        ? 'border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                        : 'border-foreground/10 text-foreground/60 hover:bg-foreground/[0.04]',
                    )}
                  >
                    {t(`kind.${k.value}`)}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('form.priceLabel')}>
                <input
                  value={rupees}
                  onChange={(e) => setRupees(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                  placeholder={t('form.pricePlaceholder')}
                  className={inputCls}
                />
              </Field>
              <Field label={t('form.compareLabel')} hint={t('common:status.optional')}>
                <input
                  value={compareRupees}
                  onChange={(e) => setCompareRupees(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                  placeholder={t('form.comparePlaceholder')}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label={t('form.stockLabel')} hint={t('form.stockHint')}>
              <input
                value={stock}
                onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder={t('form.stockPlaceholder')}
                className={inputCls}
              />
            </Field>

            <Field label={t('form.photoLabel')} hint={t('form.photoHint')}>
              <ImageUploadField value={imageUrl} onChange={setImageUrl} />
            </Field>

            <Field label={t('form.visibilityLabel')}>
              <div className="flex gap-2">
                {(['draft', 'published'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      'flex-1 rounded-full border px-3 py-2 text-xs font-bold capitalize transition-colors',
                      status === s
                        ? 'border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                        : 'border-foreground/10 text-foreground/60 hover:bg-foreground/[0.04]',
                    )}
                  >
                    {s === 'published' ? t('form.visibilityPublished') : t('form.visibilityDraft')}
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
              {t('common:actions.cancel')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!valid || saving}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50"
            >
              {saving ? t('form.saving') : product ? t('form.saveChanges') : t('form.createProduct')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const inputCls =
  'w-full rounded-2xl border border-foreground/10 bg-canvas px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/35 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-600/10';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const BUCKET = 'product-images';

/**
 * Delete a previously uploaded photo from storage, given its public URL.
 *
 * Without this, replacing or removing a photo (or deleting the product) left the
 * file in the bucket forever. Best-effort: the row is the source of truth, so a
 * failed cleanup must never block saving. Only touches our own bucket.
 */
async function deleteStoredImage(publicUrl: string | null | undefined): Promise<void> {
  if (!publicUrl) return;
  const marker = `/${BUCKET}/`;
  const at = publicUrl.indexOf(marker);
  if (at === -1) return; // not one of ours (e.g. a pasted external URL)
  const path = publicUrl.slice(at + marker.length).split('?')[0];
  if (!path) return;
  try {
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
  } catch {
    /* orphaned file is harmless — never block the user on cleanup */
  }
}

/**
 * Pick a photo from the device and put it in the `product-images` bucket.
 *
 * That bucket is public (product photos are shown to every client and signed
 * URLs would expire), so the returned public URL can be stored on the product
 * row directly. Path is {workspaceId}/{timestamp}.{ext} — the storage policy
 * checks that leading folder, so the upload fails if it isn't your workspace.
 */
function ImageUploadField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const { t } = useTranslation('ownerProducts');
  const { data: scope } = useScope();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED.includes(file.type)) {
      toast.error(t('image.wrongType'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t('image.tooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }));
      return;
    }
    if (!scope?.workspaceId) {
      toast.error(t('image.workspaceNotLoaded'));
      return;
    }

    setUploading(true);
    const previous = value; // replaced photo — remove it once the new one lands
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${scope.workspaceId}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
      void deleteStoredImage(previous);
      toast.success(t('image.uploaded'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('image.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED.join(',')}
        onChange={handleFile}
        className="hidden"
      />

      {value ? (
        <div className="flex items-center gap-3">
          <img
            src={value}
            alt={t('image.alt')}
            className="h-20 w-20 rounded-2xl border border-foreground/10 object-cover"
          />
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-full border border-foreground/15 px-3.5 py-1.5 text-xs font-bold transition-colors hover:bg-foreground/[0.05] disabled:opacity-50"
            >
              {uploading ? t('image.uploading') : t('image.replace')}
            </button>
            <button
              type="button"
              onClick={() => {
                void deleteStoredImage(value);
                onChange('');
              }}
              className="rounded-full px-3.5 py-1.5 text-xs text-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            >
              {t('common:actions.remove')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-foreground/20 py-6 transition-colors hover:border-teal-500/50 hover:bg-foreground/[0.02] disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-foreground/50" />
              <span className="text-xs text-foreground/60">{t('image.uploading')}</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-5 w-5 text-foreground/40" />
              <span className="text-xs font-medium text-foreground/70">{t('image.uploadPhoto')}</span>
              <span className="text-[10px] text-foreground/40">{t('image.formats')}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

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
  let practiceName = i18n.t('ownerProducts:workspace.defaultPractice');
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
  return { practiceName, ownerName: i18n.t('ownerProducts:workspace.you'), initials };
}
