import { useState, useEffect } from "react";
import { calculateNutrients, roundNutrients } from "@/lib/nutrition";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Loader2, Save, Download } from "lucide-react";
import { toast } from "sonner";
import { WeeklyPlanDownloader } from "@/components/WeeklyPlanDownloader";

interface MealCard {
  day_number: number;
  meal_type: "cleansing_water" | "early_morning" | "breakfast" | "mid_breakfast" | "lunch" | "evening_snack_1" | "evening_snack_2" | "dinner";
  meal_name: string;
  description: string;
  ingredients: string;
  instructions: string;
  kcal: number;
  source_id?: string;
  source_type?: 'food_item' | 'ingredient' | 'recipe';
  quantity?: number;
  unit?: string;
}

interface FoodItem {
  id: string;
  name: string;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  kcal_per_serving: number;
  serving_size: string;
  serving_unit: string;
}

interface WeeklyPlanEditorProps {
  clientId: string;
  planId?: string;
  onSuccess: () => void;
}

const MEAL_TYPES = ["cleansing_water", "early_morning", "breakfast", "mid_breakfast", "lunch", "evening_snack_1", "evening_snack_2", "dinner"] as const;
const MEAL_LABELS = {
  cleansing_water: "Cleansing Water",
  early_morning: "Early Morning",
  breakfast: "Breakfast",
  mid_breakfast: "Mid Breakfast",
  lunch: "Lunch",
  evening_snack_1: "Evening Snack 1",
  evening_snack_2: "Evening Snack 2",
  dinner: "Dinner",
};

export function WeeklyPlanEditor({ clientId, planId, onSuccess }: WeeklyPlanEditorProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [mealCards, setMealCards] = useState<MealCard[]>([]);
  const [currentDay, setCurrentDay] = useState(1);
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (open) {
      fetchFoodItems();
      if (planId) {
        loadPlan();
      } else {
        initializeEmptyPlan();
      }
    }
  }, [planId, open]);

  const fetchFoodItems = async () => {
    setLoadingItems(true);
    try {
      const [foodResp, ingResp, recResp] = await Promise.all([
        supabase.from('food_items').select('*').order('name'),
        supabase.from('ingredients').select('*').order('name'),
        supabase.from('recipes').select('*').order('name')
      ]);

      if (foodResp.error) throw foodResp.error;
      if (ingResp.error) throw ingResp.error;
      if (recResp.error) throw recResp.error;

      setFoodItems(foodResp.data || []);
      setIngredients(ingResp.data || []);
      setRecipes(recResp.data || []);
    } catch (error: any) {
      console.error('Error fetching food items:', error);
      toast.error("Failed to load food options");
    } finally {
      setLoadingItems(false);
    }
  };

  const loadPlan = async () => {
    try {
      const { data: plan, error: planError } = await supabase
        .from("weekly_plans")
        .select("*")
        .eq("id", planId)
        .single();

      if (planError) throw planError;

      setStatus((plan.status === "published" ? "published" : "draft") as "draft" | "published");

      // Initialize all 49 empty meal cards first (7 meals × 7 days)
      const emptyCards: MealCard[] = [];
      for (let day = 1; day <= 7; day++) {
        MEAL_TYPES.forEach(type => {
          emptyCards.push({
            day_number: day,
            meal_type: type,
            meal_name: "",
            description: "",
            ingredients: "",
            instructions: "",
            kcal: 0,
          });
        });
      }

      // Fetch existing meal cards from database
      const { data: existingCards, error: cardsError } = await supabase
        .from("meal_cards")
        .select("*")
        .eq("plan_id", planId);

      if (cardsError) throw cardsError;

      // Merge existing data into the empty cards structure
      const mergedCards = emptyCards.map(emptyCard => {
        const existingCard = existingCards?.find(
          c => c.day_number === emptyCard.day_number && c.meal_type === emptyCard.meal_type
        );

        if (existingCard) {
          return {
            day_number: existingCard.day_number,
            meal_type: existingCard.meal_type as any, // Cast to support old meal types
            meal_name: existingCard.meal_name,
            description: existingCard.description || "",
            ingredients: existingCard.ingredients || "",
            instructions: existingCard.instructions || "",
            kcal: existingCard.kcal,
            source_id: (existingCard as any).source_id,
            source_type: (existingCard as any).source_type,
            quantity: (existingCard as any).quantity,
            unit: (existingCard as any).unit,
          };
        }

        return emptyCard;
      });

      setMealCards(mergedCards);
    } catch (error: any) {
      toast.error(error.message || "Failed to load plan");
    }
  };

  const initializeEmptyPlan = () => {
    const cards: MealCard[] = [];
    for (let day = 1; day <= 7; day++) {
      MEAL_TYPES.forEach(type => {
        cards.push({
          day_number: day,
          meal_type: type,
          meal_name: "",
          description: "",
          ingredients: "",
          instructions: "",
          kcal: 0,
        });
      });
    }
    setMealCards(cards);
  };

  const updateMealCard = (day: number, mealType: string, field: keyof MealCard, value: any) => {
    setMealCards(prev => prev.map(card =>
      card.day_number === day && card.meal_type === mealType
        ? { ...card, [field]: value }
        : card
    ));
  };

  const getMealCard = (day: number, mealType: string) => {
    return mealCards.find(c => c.day_number === day && c.meal_type === mealType);
  };

  const getTotalKcal = () => {
    return mealCards.reduce((sum, card) => sum + (Number(card.kcal) || 0), 0);
  };

  const autofillFromSource = (day: number, mealType: string, value: string) => {
    const [type, id] = value.split(':');
    let item: any;
    let name = '';
    let kcal = 0;
    let unit = '';
    let quantity = 1;

    if (type === 'recipe') {
      item = recipes.find(r => r.id === id);
      name = item?.name || '';
      kcal = item?.total_kcal ? Math.round(item.total_kcal / (item.servings || 1)) : 0;
      unit = 'portion';
    } else {
      item = type === 'ingredient' ? ingredients.find(i => i.id === id) : foodItems.find(f => f.id === id);
      name = item?.name || '';
      quantity = parseFloat(item?.serving_size) || 1;
      unit = item?.serving_unit || '';
      
      const nutrients = calculateNutrients(item, quantity);
      kcal = Math.round(nutrients.kcal);
    }

    updateMealCard(day, mealType, 'meal_name', name);
    updateMealCard(day, mealType, 'kcal', kcal);
    updateMealCard(day, mealType, 'source_id', id);
    updateMealCard(day, mealType, 'source_type', type as any);
    updateMealCard(day, mealType, 'quantity', quantity);
    updateMealCard(day, mealType, 'unit', unit);

    if (item && (type === 'ingredient' || type === 'food_item')) {
      const nutrients = [];
      if (item.protein) nutrients.push(`Protein: ${item.protein}g`);
      if (item.carbs) nutrients.push(`Carbs: ${item.carbs}g`);
      if (item.fats) nutrients.push(`Fats: ${item.fats}g`);
      updateMealCard(day, mealType, 'ingredients', nutrients.join(', '));
    }
  };

  const handleQuantityChange = (day: number, mealType: string, qty: number) => {
    const card = getMealCard(day, mealType);
    if (!card || !card.source_id || !card.source_type || card.source_type === 'recipe') {
      updateMealCard(day, mealType, 'quantity', qty);
      return;
    }

    const item = card.source_type === 'ingredient' 
      ? ingredients.find(i => i.id === card.source_id)
      : foodItems.find(f => f.id === card.source_id);

    if (item) {
      const nutrients = calculateNutrients(item, qty);
      updateMealCard(day, mealType, 'kcal', Math.round(nutrients.kcal));
      
      const nutrientText = [];
      const rounded = roundNutrients(nutrients);
      if (rounded.protein) nutrientText.push(`Protein: ${rounded.protein}g`);
      if (rounded.carbs) nutrientText.push(`Carbs: ${rounded.carbs}g`);
      if (rounded.fats) nutrientText.push(`Fats: ${rounded.fats}g`);
      updateMealCard(day, mealType, 'ingredients', nutrientText.join(', '));
    }

    updateMealCard(day, mealType, 'quantity', qty);
  };

  const handleSave = async (publish: boolean) => {
    // Auto-calculate dates
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    setSaving(true);

    try {
      const planData = {
        client_id: clientId,
        week_number: 1, // Default to week 1
        start_date: startDate,
        end_date: endDate,
        status: publish ? "published" : "draft",
        total_kcal: getTotalKcal(),
        published_at: publish ? new Date().toISOString() : null,
      };

      let newPlanId = planId;

      if (planId) {
        // Update existing plan
        const { error: updateError } = await supabase
          .from("weekly_plans")
          .update(planData)
          .eq("id", planId);

        if (updateError) throw updateError;

        // Delete old meal cards
        const { error: deleteError } = await supabase
          .from("meal_cards")
          .delete()
          .eq("plan_id", planId);

        if (deleteError) throw deleteError;
      } else {
        // Create new plan
        const { data: newPlan, error: createError } = await supabase
          .from("weekly_plans")
          .insert(planData)
          .select()
          .single();

        if (createError) throw createError;
        newPlanId = newPlan.id;
      }

      // Insert meal cards with type assertion for new meal types
      const cardsToInsert = mealCards
        .filter(card => card.meal_name.trim() !== "")
        .map(card => ({
          plan_id: newPlanId,
          day_number: card.day_number,
          meal_type: card.meal_type as any, // Cast to any to support new meal types
          meal_name: card.meal_name,
          description: card.description || null,
          ingredients: card.ingredients || null,
          instructions: card.instructions || null,
          kcal: card.kcal,
          source_id: card.source_id || null,
          source_type: card.source_type || null,
          quantity: card.quantity || null,
          unit: card.unit || null,
        }));

      if (cardsToInsert.length > 0) {
        const { error: cardsError } = await supabase
          .from("meal_cards")
          .insert(cardsToInsert);

        if (cardsError) throw cardsError;
      }
      
      // Send push notification if published
      if (publish) {
        supabase.functions.invoke('send-push-notification', {
          body: {
            client_id: clientId,
            title: 'New Weekly Plan Published',
            body: 'Your latest nutrition and meal plan is ready to view!',
            url: '/dashboard?tab=diet_plan',
          }
        }).catch(err => console.error('Error sending published plan notification:', err));

        try { localStorage.setItem('sheizen-notify', JSON.stringify({ title: 'New Weekly Plan Published', body: 'Your latest nutrition and meal plan is ready to view!', ts: Date.now() })); } catch (e) {}
      }

      toast.success(publish ? "Plan published successfully!" : "Plan saved as draft!");
      setOpen(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {planId ? "Edit Plan" : "Create Plan"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 shrink-0 border-b">
          <DialogTitle>{planId ? "Edit Weekly Plan" : "Create Weekly Plan"}</DialogTitle>
          <DialogDescription>
            Build a 7-day meal plan with meal cards for each day
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm font-medium">Total Weekly Kcal</p>
                <p className="text-2xl font-bold">{getTotalKcal()}</p>
              </div>
            </div>

            <Tabs value={`day-${currentDay}`} onValueChange={(v) => setCurrentDay(parseInt(v.split("-")[1]))}>
              <TabsList className="grid grid-cols-7 w-full">
                {[1, 2, 3, 4, 5, 6, 7].map(day => (
                  <TabsTrigger key={day} value={`day-${day}`}>Day {day}</TabsTrigger>
                ))}
              </TabsList>

              {[1, 2, 3, 4, 5, 6, 7].map(day => (
                <TabsContent key={day} value={`day-${day}`} className="space-y-4">
                  {MEAL_TYPES.map(mealType => {
                    const card = getMealCard(day, mealType);
                    if (!card) return null;

                    return (
                      <Card key={mealType}>
                        <CardHeader>
                          <CardTitle className="text-lg">{MEAL_LABELS[mealType]}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <Label>Select Food/Recipe (Optional)</Label>
                            <Select 
                              onValueChange={(val) => autofillFromSource(day, mealType, val)}
                              disabled={loadingItems || saving}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={loadingItems ? "Loading options..." : "Choose from food, ingredients or recipes..."} />
                              </SelectTrigger>
                              <SelectContent>
                                {recipes.length > 0 && (
                                  <>
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">Recipes</div>
                                    {recipes.map(recipe => (
                                      <SelectItem key={recipe.id} value={`recipe:${recipe.id}`}>
                                        {recipe.name} ({Math.round(recipe.total_kcal / recipe.servings)} kcal)
                                      </SelectItem>
                                    ))}
                                  </>
                                )}
                                {ingredients.length > 0 && (
                                  <>
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">Ingredients</div>
                                    {ingredients.map(ing => (
                                      <SelectItem key={ing.id} value={`ingredient:${ing.id}`}>
                                        {ing.name} ({ing.kcal_per_serving} kcal / {ing.serving_size}{ing.serving_unit})
                                      </SelectItem>
                                    ))}
                                  </>
                                )}
                                {foodItems.length > 0 && (
                                  <>
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">Food Items</div>
                                    {foodItems.map(item => (
                                      <SelectItem key={item.id} value={`food_item:${item.id}`}>
                                        {item.name} ({item.kcal_per_serving} kcal / {item.serving_size}{item.serving_unit})
                                      </SelectItem>
                                    ))}
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Meal Name</Label>
                              <Input
                                value={card.meal_name}
                                onChange={(e) => updateMealCard(day, mealType, "meal_name", e.target.value)}
                                placeholder="e.g., Oatmeal with Berries"
                                disabled={saving}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label>Quantity</Label>
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={card.quantity || ''}
                                  onChange={(e) => handleQuantityChange(day, mealType, parseFloat(e.target.value) || 0)}
                                  disabled={saving}
                                />
                              </div>
                              <div>
                                <Label>Unit</Label>
                                <Input
                                  value={card.unit || ''}
                                  onChange={(e) => updateMealCard(day, mealType, "unit", e.target.value)}
                                  disabled={saving}
                                />
                              </div>
                            </div>
                          </div>
                          <div>
                            <Label>Description</Label>
                            <Textarea
                              value={card.description}
                              onChange={(e) => updateMealCard(day, mealType, "description", e.target.value)}
                              placeholder="Brief description..."
                              rows={1}
                              disabled={saving}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Ingredients / Macros</Label>
                              <Textarea
                                value={card.ingredients}
                                onChange={(e) => updateMealCard(day, mealType, "ingredients", e.target.value)}
                                placeholder="List ingredients..."
                                rows={1}
                                disabled={saving}
                              />
                            </div>
                            <div>
                              <Label>Kcal</Label>
                              <Input
                                type="number"
                                value={card.kcal}
                                onChange={(e) => updateMealCard(day, mealType, "kcal", parseInt(e.target.value) || 0)}
                                disabled={saving}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          {planId && (
            <WeeklyPlanDownloader
              planId={planId}
              weekNumber={1}
              startDate={new Date().toISOString().split('T')[0]}
              endDate={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
              triggerButton={
                <Button variant="outline" disabled={saving}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Plan
                </Button>
              }
            />
          )}
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="group">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />}
            Save Draft
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving} className="bg-wellness-green hover:bg-wellness-green/90 group">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />}
            Publish Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
