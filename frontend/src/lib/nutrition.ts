
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface FoodBase {
  name: string;
  serving_size: string | number;
  serving_unit: string;
  kcal_per_serving: number;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
}

/**
 * Calculates nutrients based on a quantity relative to the base serving size.
 */
export function calculateNutrients(
  food: FoodBase,
  quantity: number
): Nutrients {
  const servingSize = parseFloat(String(food.serving_size)) || 1;
  const multiplier = quantity / servingSize;

  return {
    kcal: (food.kcal_per_serving || 0) * multiplier,
    protein: (food.protein || 0) * multiplier,
    carbs: (food.carbs || 0) * multiplier,
    fats: (food.fats || 0) * multiplier,
  };
}

/**
 * Rounds nutrients to standard decimal places for display.
 */
export function roundNutrients(nutrients: Nutrients) {
  return {
    kcal: Math.round(nutrients.kcal),
    protein: Number(nutrients.protein.toFixed(1)),
    carbs: Number(nutrients.carbs.toFixed(1)),
    fats: Number(nutrients.fats.toFixed(1)),
  };
}

/**
 * Summarizes nutrients across multiple ingredients.
 */
export function summarizeNutrients(items: { nutrients: Nutrients }[]): Nutrients {
  return items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + item.nutrients.kcal,
      protein: acc.protein + item.nutrients.protein,
      carbs: acc.carbs + item.nutrients.carbs,
      fats: acc.fats + item.nutrients.fats,
    }),
    { kcal: 0, protein: 0, carbs: 0, fats: 0 }
  );
}
