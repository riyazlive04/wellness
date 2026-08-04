/**
 * Products — ports the web Products page.
 *
 * The catalogue clients buy from inside their portal (Razorpay), plus the
 * order book with fulfilment. Prices are stored in paise; the form takes
 * rupees and converts, because nobody types paise.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  Field,
  ListRow,
  Loading,
  Pill,
  SegmentedTabs,
  Sheet,
  StatTile,
  TileRow,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { storeApi, type Product, type ProductKind, type ProductStatus } from '@/lib/owner/api/store';
import { dateTime, initials, inr, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Tab = 'catalogue' | 'orders';

const KINDS: ProductKind[] = ['physical', 'digital', 'service'];
const STATUSES: ProductStatus[] = ['draft', 'published', 'archived'];

export function ProductsSection() {
  const t = useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('catalogue');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const productsQ = useQuery({
    queryKey: ['products'],
    queryFn: () => storeApi.list(true),
  });
  const ordersQ = useQuery({
    queryKey: ['products', 'orders'],
    queryFn: storeApi.orders,
    enabled: tab === 'orders',
  });

  const fulfil = useMutation({
    mutationFn: (id: string) => storeApi.fulfil(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['products', 'orders'] }),
    onError: (e: Error) => Alert.alert('Could not fulfil', e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => storeApi.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  const orders = ordersQ.data ?? [];
  const paid = orders.filter((o) => o.status === 'paid' || o.status === 'fulfilled');
  const revenue = paid.reduce((s, o) => s + o.amount_paise, 0);
  const awaiting = orders.filter((o) => o.status === 'paid').length;

  return (
    <>
      <SegmentedTabs
        options={[
          { key: 'catalogue', label: 'Catalogue', badge: productsQ.data?.length },
          { key: 'orders', label: 'Orders', badge: awaiting || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'catalogue' ? (
        <>
          <ActionButton label="Add a product" icon="add" onPress={() => setCreating(true)} />
          {productsQ.isLoading ? (
            <Loading />
          ) : productsQ.isError ? (
            <QueryError error={productsQ.error} onRetry={() => void productsQ.refetch()} />
          ) : !productsQ.data?.length ? (
            <EmptyState
              icon="pricetag-outline"
              title="Nothing for sale yet"
              body="Add supplements, meal kits or a paid consultation and clients can buy it from their app."
            />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {productsQ.data.map((p) => (
                <ListRow
                  key={p.id}
                  title={p.name}
                  subtitle={[
                    titleCase(p.kind),
                    p.stock_quantity === null ? 'Unlimited stock' : `${p.stock_quantity} in stock`,
                  ].join(' · ')}
                  icon="pricetag-outline"
                  tint={p.status === 'published' ? t.colors.success : undefined}
                  meta={inr(p.price_paise, { fromPaise: true })}
                  onPress={() => setEditing(p)}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Pill
                        label={titleCase(p.status)}
                        tone={p.status === 'published' ? 'success' : p.status === 'draft' ? 'warning' : 'neutral'}
                      />
                      <AppText
                        variant="caption"
                        tone="danger"
                        onPress={() =>
                          Alert.alert('Delete product?', p.name, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(p.id) },
                          ])
                        }>
                        Delete
                      </AppText>
                    </View>
                  }
                />
              ))}
            </Card>
          )}
        </>
      ) : (
        <>
          <TileRow>
            <StatTile label="Paid orders" value={paid.length} icon="cart-outline" />
            <StatTile label="Revenue" value={inr(revenue, { fromPaise: true })} icon="cash-outline" />
            <StatTile label="To fulfil" value={awaiting} icon="cube-outline" tint={t.colors.warning} />
          </TileRow>

          {ordersQ.isLoading ? (
            <Loading />
          ) : !orders.length ? (
            <EmptyState icon="cart-outline" title="No orders yet" />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {orders.map((o) => (
                <ListRow
                  key={o.id}
                  title={o.product_name}
                  subtitle={[
                    o.client_name ?? 'Client',
                    `×${o.quantity}`,
                    dateTime(o.paid_at ?? o.created_at),
                  ].join(' · ')}
                  avatarText={initials(o.client_name ?? 'C')}
                  meta={inr(o.amount_paise, { fromPaise: true })}
                  right={
                    o.status === 'paid' ? (
                      <AppText variant="caption" tone="accent" onPress={() => fulfil.mutate(o.id)}>
                        Fulfil
                      </AppText>
                    ) : (
                      <Pill
                        label={titleCase(o.status)}
                        tone={o.status === 'fulfilled' ? 'success' : o.status === 'failed' ? 'danger' : 'neutral'}
                      />
                    )
                  }
                />
              ))}
            </Card>
          )}
        </>
      )}

      <ProductSheet
        product={editing}
        creating={creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </>
  );
}

function ProductSheet({
  product,
  creating,
  onClose,
}: {
  product: Product | null;
  creating: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const visible = !!product || creating;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<ProductKind>('physical');
  const [status, setStatus] = useState<ProductStatus>('draft');
  const [rupees, setRupees] = useState('');
  const [stock, setStock] = useState('');
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Hydrate from the product being edited exactly once per open, so typing
  // isn't clobbered by a background refetch.
  const key = product?.id ?? (creating ? 'new' : null);
  if (visible && key && hydratedFor !== key) {
    setHydratedFor(key);
    setName(product?.name ?? '');
    setDescription(product?.description ?? '');
    setKind(product?.kind ?? 'physical');
    setStatus(product?.status ?? 'draft');
    setRupees(product ? String(Math.round(product.price_paise / 100)) : '');
    setStock(product?.stock_quantity !== null && product?.stock_quantity !== undefined ? String(product.stock_quantity) : '');
  }

  const close = () => {
    setHydratedFor(null);
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        kind,
        pricePaise: Math.round((Number(rupees) || 0) * 100),
        status,
        stockQuantity: stock.trim() === '' ? null : Number(stock),
      };
      return product ? storeApi.update(product.id, body) : storeApi.create(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      close();
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  return (
    <Sheet visible={visible} onClose={close} title={product ? 'Edit product' : 'New product'}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Whey isolate 1kg" />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="muted">
          KIND
        </AppText>
        <SegmentedTabs options={KINDS.map((k) => ({ key: k, label: titleCase(k) }))} value={kind} onChange={setKind} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Price (₹)" value={rupees} onChangeText={setRupees} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Stock"
            value={stock}
            onChangeText={setStock}
            keyboardType="number-pad"
            hint="Blank = unlimited"
          />
        </View>
      </View>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="muted">
          STATUS
        </AppText>
        <SegmentedTabs
          options={STATUSES.map((s) => ({ key: s, label: titleCase(s) }))}
          value={status}
          onChange={setStatus}
        />
        <AppText variant="caption" tone="faint">
          Only published products appear in the client store.
        </AppText>
      </View>
      <ActionButton
        label={product ? 'Save changes' : 'Add product'}
        disabled={!name.trim() || !rupees}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </Sheet>
  );
}
