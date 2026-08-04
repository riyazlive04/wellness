/**
 * Nutrition — one destination, four sections, exactly like the web's
 * NutritionTabs bar: Food library · Recipes · Plate review · Products.
 *
 * The default tab (Foods) is gated on `food_library.view`; Recipes carries the
 * `recipes` plan feature on its own tab so a Growth workspace sees the rest of
 * the page instead of a locked door.
 */
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FoodsSection } from '@/components/owner/nutrition/foods';
import { PlateReviewSection } from '@/components/owner/nutrition/plate-review';
import { ProductsSection } from '@/components/owner/nutrition/products';
import { RecipesSection } from '@/components/owner/nutrition/recipes';
import { OwnerPage, RouteGate, SegmentedTabs } from '@/components/owner/ui';
import { useOwner } from '@/contexts/owner-context';
import { plateVisionApi } from '@/lib/owner/api/plate-vision';
import { spacing } from '@/lib/theme';

type Tab = 'foods' | 'recipes' | 'plate-review' | 'products';

export default function OwnerNutrition() {
  return (
    <RouteGate permission="food_library.view">
      <NutritionInner />
    </RouteGate>
  );
}

function NutritionInner() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { hasFeature } = useOwner();
  const [tab, setTab] = useState<Tab>(
    params.tab === 'recipes' || params.tab === 'plate-review' || params.tab === 'products'
      ? (params.tab as Tab)
      : 'foods',
  );

  // Pending-review count drives the tab badge — the one number on this page
  // that means "someone is waiting on you".
  const pendingQ = useQuery({
    queryKey: ['plates', 'review', 'pending'],
    queryFn: () => plateVisionApi.reviewQueue({ status: 'pending', limit: 50 }),
  });

  return (
    <OwnerPage
      title="Nutrition"
      subtitle="Foods, recipes, plates and products"
      back
      contentStyle={{ paddingHorizontal: 0 }}>
      <SegmentedTabs
        options={[
          { key: 'foods', label: 'Food library' },
          ...(hasFeature('recipes') ? [{ key: 'recipes' as const, label: 'Recipes' }] : []),
          { key: 'plate-review', label: 'Plate review', badge: pendingQ.data?.length || undefined },
          { key: 'products', label: 'Products' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {tab === 'foods' ? <FoodsSection /> : null}
        {tab === 'recipes' ? <RecipesSection /> : null}
        {tab === 'plate-review' ? <PlateReviewSection /> : null}
        {tab === 'products' ? <ProductsSection /> : null}
      </View>
    </OwnerPage>
  );
}
