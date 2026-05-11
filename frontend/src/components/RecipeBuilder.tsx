import { useEffect, useState } from "react";
import { calculateNutrients, summarizeNutrients, roundNutrients } from "@/lib/nutrition";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Loader2, ChefHat, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { RecipeImport } from "./RecipeImport";

interface Recipe {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  servings: number;
  total_kcal: number | null;
  video_url: string | null;
  created_at: string;
}

interface Ingredient {
  id: string;
  name: string;
  serving_size: string;
  serving_unit: string;
  kcal_per_serving: number;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
}

interface RecipeIngredient {
  id?: string;
  ingredient_id: string;
  ingredient?: Ingredient;
  quantity: number;
  unit: string;
}


const recipeSchema = z.object({
  name: z.string().min(1, "Recipe name is required").max(100),
  description: z.string().max(500).optional(),
  instructions: z.string().optional(),
  video_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  servings: z.number().min(1, "Servings must be at least 1"),
});

export function RecipeBuilder() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [deleteRecipeId, setDeleteRecipeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [recipeName, setRecipeName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [servings, setServings] = useState(1);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch recipes
      const { data: recipesData, error: recipesError } = await supabase
        .from("recipes")
        .select("*")
        .order("name", { ascending: true });

      if (recipesError) throw recipesError;
      setRecipes((recipesData as any) || []);

      // Fetch ingredients
      const { data: ingredientsData, error: ingredientsError } = await supabase
        .from("ingredients")
        .select("*")
        .order("name", { ascending: true });

      if (ingredientsError) throw ingredientsError;
      setIngredients(ingredientsData || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setRecipeName("");
    setDescription("");
    setInstructions("");
    setVideoUrl("");
    setServings(1);
    setRecipeIngredients([]);
    setEditingRecipe(null);
  };

  const handleAdd = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = async (recipe: Recipe) => {
    setRecipeName(recipe.name);
    setDescription(recipe.description || "");
    setInstructions(recipe.instructions || "");
    setVideoUrl(recipe.video_url || "");
    setServings(recipe.servings);
    setEditingRecipe(recipe);

    // Fetch recipe ingredients
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .select("*, ingredients:ingredients!recipe_ingredients_ingredient_id_fkey(*)")
      .eq("recipe_id", recipe.id);

    if (error) {
      console.error("Error loading ingredients:", error);
      toast.error(`Failed to load recipe ingredients: ${error.message} (${error.details || ''})`);
      return;
    }

    setRecipeIngredients(
      data.map((ing: any) => ({
        id: ing.id,
        ingredient_id: ing.ingredient_id,
        ingredient: ing.ingredients,
        quantity: ing.quantity,
        unit: ing.unit,
      }))
    );

    setIsDialogOpen(true);
  };

  const addIngredient = () => {
    if (ingredients.length === 0) {
      toast.error("No ingredients available. Add ingredients first.");
      return;
    }

    setRecipeIngredients([
      ...recipeIngredients,
      {
        ingredient_id: ingredients[0].id,
        ingredient: ingredients[0],
        quantity: 1,
        unit: ingredients[0].serving_unit,
      },
    ]);
  };

  const updateIngredient = (index: number, field: keyof RecipeIngredient, value: any) => {
    const updated = [...recipeIngredients];

    if (field === "ingredient_id") {
      const ingredient = ingredients.find((f) => f.id === value);
      updated[index] = {
        ...updated[index],
        ingredient_id: value,
        ingredient: ingredient,
        unit: ingredient?.serving_unit || updated[index].unit,
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }

    setRecipeIngredients(updated);
  };

  const removeIngredient = (index: number) => {
    setRecipeIngredients(recipeIngredients.filter((_, i) => i !== index));
  };

  const calculateNutrition = () => {
    const items = recipeIngredients.map(ing => {
      const ingredient = ing.ingredient || ingredients.find((f) => f.id === ing.ingredient_id);
      if (!ingredient) return { nutrients: { kcal: 0, protein: 0, carbs: 0, fats: 0 } };
      
      return {
        nutrients: calculateNutrients(ingredient, ing.quantity)
      };
    });

    return summarizeNutrients(items);
  };

  const handleSave = async () => {
    try {
      // Validate
      const validatedData = recipeSchema.parse({
        name: recipeName,
        description: description || undefined,
        instructions: instructions || undefined,
        video_url: videoUrl || undefined,
        servings,
      });

      if (recipeIngredients.length === 0) {
        toast.error("Add at least one ingredient");
        return;
      }

      setSaving(true);

      const nutrition = calculateNutrition();

      const recipeData = {
        name: validatedData.name,
        description: validatedData.description || null,
        instructions: validatedData.instructions || null,
        video_url: validatedData.video_url || null,
        servings: validatedData.servings,
        total_kcal: Math.round(nutrition.kcal),
      };

      let recipeId = editingRecipe?.id;

      if (editingRecipe) {
        // Update existing recipe
        const { error } = await supabase
          .from("recipes")
          .update(recipeData)
          .eq("id", editingRecipe.id);

        if (error) throw error;

        // Delete old ingredients
        const { error: deleteError } = await supabase
          .from("recipe_ingredients")
          .delete()
          .eq("recipe_id", editingRecipe.id);

        if (deleteError) throw deleteError;
      } else {
        // Create new recipe
        const { data, error } = await supabase
          .from("recipes")
          .insert(recipeData)
          .select()
          .single();

        if (error) throw error;
        recipeId = data.id;
      }

      // Insert ingredients
      const ingredientsData = recipeIngredients.map((ing) => ({
        recipe_id: recipeId,
        ingredient_id: ing.ingredient_id,
        quantity: ing.quantity,
        unit: ing.unit,
      }));

      const { error: ingredientsError } = await supabase
        .from("recipe_ingredients")
        .insert(ingredientsData);

      if (ingredientsError) throw ingredientsError;

      toast.success(editingRecipe ? "Recipe updated!" : "Recipe created!");
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error(error.message || "Failed to save recipe");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("recipes").delete().eq("id", id);

      if (error) throw error;

      toast.success("Recipe deleted!");
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete recipe");
    } finally {
      setDeleteRecipeId(null);
    }
  };

  const filteredRecipes = recipes.filter((recipe) =>
    recipe.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totals = calculateNutrition();
  const totalNutrition = roundNutrients(totals);
  const perServingNutrition = roundNutrients({
    kcal: totals.kcal / servings,
    protein: totals.protein / servings,
    carbs: totals.carbs / servings,
    fats: totals.fats / servings,
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recipe Builder</CardTitle>
              <CardDescription>Create recipes from food items with auto-calculated nutrition</CardDescription>
            </div>
            <div className="flex gap-2">
              <RecipeImport
                onImportComplete={fetchData}
                existingIngredients={ingredients.map(i => ({ id: i.id, name: i.name }))}
              />
              <Button onClick={handleAdd}>
                <Plus className="mr-2 h-4 w-4" />
                Create Recipe
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recipes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading recipes...</div>
          ) : filteredRecipes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ChefHat className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">{searchQuery ? "No recipes found" : "No recipes yet"}</p>
              <p className="text-sm">
                {searchQuery ? "Try a different search" : "Create your first recipe to get started"}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipe Name</TableHead>
                    <TableHead>Servings</TableHead>
                    <TableHead className="text-right">Total Kcal</TableHead>
                    <TableHead className="text-right">Kcal/Serving</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecipes.map((recipe) => (
                    <TableRow key={recipe.id}>
                      <TableCell className="font-medium">{recipe.name}</TableCell>
                      <TableCell>{recipe.servings}</TableCell>
                      <TableCell className="text-right">{recipe.total_kcal || "—"}</TableCell>
                      <TableCell className="text-right">
                        {recipe.total_kcal ? Math.round(recipe.total_kcal / recipe.servings) : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{recipe.description || "—"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(recipe)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleteRecipeId(recipe.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            Showing {filteredRecipes.length} of {recipes.length} recipes
          </div>
        </CardContent>
      </Card>

      {/* Recipe Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsDialogOpen(false);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="p-6 pb-4 shrink-0">
            <DialogTitle>{editingRecipe ? "Edit Recipe" : "Create Recipe"}</DialogTitle>
            <DialogDescription>Build a recipe by selecting food items and specifying quantities</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 min-h-0">
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recipe-name">Recipe Name *</Label>
                    <Input
                      id="recipe-name"
                      value={recipeName}
                      onChange={(e) => setRecipeName(e.target.value)}
                      placeholder="e.g., Grilled Chicken Salad"
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="servings">Servings *</Label>
                    <Input
                      id="servings"
                      type="number"
                      min="1"
                      value={servings}
                      onChange={(e) => setServings(parseInt(e.target.value) || 1)}
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the recipe..."
                    rows={2}
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instructions">Instructions</Label>
                  <Textarea
                    id="instructions"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Step-by-step cooking instructions..."
                    rows={3}
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="video-url">Video URL (Optional)</Label>
                  <Input
                    id="video-url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="e.g., YouTube or Vimeo link"
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Ingredients */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Ingredients</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addIngredient} disabled={saving}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Ingredient
                  </Button>
                </div>

                {recipeIngredients.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>No ingredients added yet</p>
                    <p className="text-sm">Click "Add Ingredient" to start building your recipe</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recipeIngredients.map((recipeIng, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 border rounded-lg">
                        <div className="flex-1">
                          <Select
                            value={recipeIng.ingredient_id}
                            onValueChange={(value) => updateIngredient(index, "ingredient_id", value)}
                            disabled={saving}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ingredients.map((ing) => (
                                <SelectItem key={ing.id} value={ing.id}>
                                  {ing.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={recipeIng.quantity}
                            onChange={(e) => updateIngredient(index, "quantity", parseFloat(e.target.value) || 0)}
                            placeholder="Qty"
                            disabled={saving}
                          />
                        </div>
                        <div className="w-24">
                          <Input
                            value={recipeIng.unit}
                            onChange={(e) => updateIngredient(index, "unit", e.target.value)}
                            placeholder="Unit"
                            disabled={saving}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeIngredient(index)}
                          disabled={saving}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Nutrition Summary */}
              {recipeIngredients.length > 0 && (
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold">Nutritional Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total (entire recipe)</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="secondary">{Math.round(totalNutrition.kcal)} kcal</Badge>
                        <Badge variant="outline">{totalNutrition.protein.toFixed(1)}g protein</Badge>
                        <Badge variant="outline">{totalNutrition.carbs.toFixed(1)}g carbs</Badge>
                        <Badge variant="outline">{totalNutrition.fats.toFixed(1)}g fats</Badge>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Per Serving</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="default">{Math.round(perServingNutrition.kcal)} kcal</Badge>
                        <Badge variant="outline">{perServingNutrition.protein.toFixed(1)}g protein</Badge>
                        <Badge variant="outline">{perServingNutrition.carbs.toFixed(1)}g carbs</Badge>
                        <Badge variant="outline">{perServingNutrition.fats.toFixed(1)}g fats</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="p-6 pt-4 shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                resetForm();
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || ingredients.length === 0}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Recipe"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteRecipeId} onOpenChange={() => setDeleteRecipeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipe</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this recipe? This will also remove all its ingredients.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteRecipeId && handleDelete(deleteRecipeId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
