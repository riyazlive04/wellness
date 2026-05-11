import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  parseExcelFile,
  generateExcelTemplate,
  validateRequired,
  validateNumber,
  validateString,
} from "@/lib/importUtils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RecipeIngredientImport {
  ingredient_name: string;
  quantity: number;
  unit: string;
}

interface RecipeImport {
  recipe_name: string;
  description?: string;
  instructions?: string;
  servings: number;
  ingredients: RecipeIngredientImport[];
}

interface ParsedRecipe extends RecipeImport {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  unmatchedIngredients: string[];
}

interface RecipeImportProps {
  onImportComplete: () => void;
  existingIngredients: { id: string; name: string }[];
}

export function RecipeImport({ onImportComplete, existingIngredients }: RecipeImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [parsedRecipes, setParsedRecipes] = useState<ParsedRecipe[]>([]);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);

  const downloadTemplate = () => {
    const columns = [
      { header: 'recipe_name', key: 'recipe_name', example: 'Grilled Chicken Salad' },
      { header: 'description', key: 'description', example: 'Healthy protein-rich salad' },
      { header: 'instructions', key: 'instructions', example: 'Grill chicken, mix with vegetables' },
      { header: 'servings', key: 'servings', example: '2' },
      { header: 'ingredient_name', key: 'ingredient_name', example: 'Chicken Breast' },
      { header: 'quantity', key: 'quantity', example: '200' },
      { header: 'unit', key: 'unit', example: 'g' },
    ];
    
    generateExcelTemplate(columns, 'recipes-template.xlsx');
    toast.success("Template downloaded! Note: Multiple ingredients should be on separate rows with the same recipe_name.");
  };

  const matchIngredientToFoodItem = (ingredientName: string): string | null => {
    const normalized = ingredientName.toLowerCase().trim();
    const match = existingIngredients.find(
      item => item.name.toLowerCase().trim() === normalized
    );
    return match?.id || null;
  };

  const groupRecipes = (rawData: any[]): Map<string, any[]> => {
    const grouped = new Map<string, any[]>();
    
    rawData.forEach(row => {
      const recipeName = String(row.recipe_name || '').trim();
      if (!recipeName) return;
      
      if (!grouped.has(recipeName)) {
        grouped.set(recipeName, []);
      }
      grouped.get(recipeName)!.push(row);
    });
    
    return grouped;
  };

  const validateRecipe = (rows: any[], rowNumber: number): ParsedRecipe => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const unmatchedIngredients: string[] = [];

    const firstRow = rows[0];

    // Validate recipe-level fields
    const nameError = validateRequired(firstRow.recipe_name, 'Recipe Name');
    if (nameError) errors.push(nameError);
    else {
      const nameStrError = validateString(firstRow.recipe_name, 'Recipe Name', 100);
      if (nameStrError) errors.push(nameStrError);
    }

    if (firstRow.description) {
      const descError = validateString(firstRow.description, 'Description', 500);
      if (descError) errors.push(descError);
    }

    const servingsError = validateRequired(firstRow.servings, 'Servings');
    if (servingsError) errors.push(servingsError);
    else {
      const servingsNumError = validateNumber(firstRow.servings, 'Servings', 1);
      if (servingsNumError) errors.push(servingsNumError);
    }

    // Validate ingredients
    const ingredients: RecipeIngredientImport[] = [];
    
    rows.forEach((row, idx) => {
      const ingNameError = validateRequired(row.ingredient_name, `Ingredient ${idx + 1} Name`);
      if (ingNameError) {
        errors.push(ingNameError);
        return;
      }

      const qtyError = validateRequired(row.quantity, `Ingredient ${idx + 1} Quantity`);
      if (qtyError) {
        errors.push(qtyError);
      } else {
        const qtyNumError = validateNumber(row.quantity, `Ingredient ${idx + 1} Quantity`, 0);
        if (qtyNumError) errors.push(qtyNumError);
      }

      const unitError = validateRequired(row.unit, `Ingredient ${idx + 1} Unit`);
      if (unitError) errors.push(unitError);

      const ingredientName = String(row.ingredient_name || '').trim();
      const foodItemId = matchIngredientToFoodItem(ingredientName);
      
      if (!foodItemId) {
        unmatchedIngredients.push(ingredientName);
        warnings.push(`Ingredient "${ingredientName}" not found in ingredients database`);
      }

      ingredients.push({
        ingredient_name: ingredientName,
        quantity: Number(row.quantity) || 0,
        unit: String(row.unit || '').trim(),
      });
    });

    if (ingredients.length === 0) {
      errors.push("Recipe must have at least one ingredient");
    }

    return {
      recipe_name: String(firstRow.recipe_name || '').trim(),
      description: firstRow.description ? String(firstRow.description).trim() : undefined,
      instructions: firstRow.instructions ? String(firstRow.instructions).trim() : undefined,
      servings: Number(firstRow.servings) || 1,
      ingredients,
      rowNumber,
      isValid: errors.length === 0 && unmatchedIngredients.length === 0,
      errors,
      warnings,
      unmatchedIngredients,
    };
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setParsing(true);
    try {
      const rawData = await parseExcelFile(file);
      
      if (rawData.length === 0) {
        toast.error("The file is empty or invalid");
        return;
      }

      const grouped = groupRecipes(rawData);
      const validated: ParsedRecipe[] = [];
      let rowCounter = 2; // Excel rows start at 1, header is row 1

      grouped.forEach((rows, recipeName) => {
        const recipe = validateRecipe(rows, rowCounter);
        validated.push(recipe);
        rowCounter += rows.length;
      });

      setParsedRecipes(validated);
      setIsOpen(true);

      const validCount = validated.filter(r => r.isValid).length;
      const invalidCount = validated.length - validCount;
      const warningCount = validated.filter(r => r.warnings.length > 0).length;
      
      if (invalidCount > 0 || warningCount > 0) {
        toast.warning(`${validCount} valid recipes, ${invalidCount} invalid, ${warningCount} with warnings`);
      } else {
        toast.success(`${validCount} recipes ready to import`);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to parse file");
    } finally {
      setParsing(false);
      event.target.value = '';
    }
  };

  const handleImport = async () => {
    const validRecipes = parsedRecipes.filter(r => r.isValid);
    
    if (validRecipes.length === 0) {
      toast.error("No valid recipes to import");
      return;
    }

    setImporting(true);
    try {
      for (const recipe of validRecipes) {
        // Calculate total kcal
        let totalKcal = 0;
        const ingredientsData: any[] = [];

        for (const ing of recipe.ingredients) {
          const foodItemId = matchIngredientToFoodItem(ing.ingredient_name);
          if (!foodItemId) continue;

          const ingredient = existingIngredients.find(f => f.id === foodItemId);
          if (ingredient) {
            // Fetch full ingredient data for kcal calculation
            const { data: ingredientData } = await supabase
              .from('ingredients')
              .select('kcal_per_serving, serving_size')
              .eq('id', foodItemId)
              .single();

            if (ingredientData) {
              const servingSizeNum = parseFloat(ingredientData.serving_size);
              const multiplier = ing.quantity / servingSizeNum;
              totalKcal += ingredientData.kcal_per_serving * multiplier;
            }
          }

          ingredientsData.push({
            ingredient_id: foodItemId,
            quantity: ing.quantity,
            unit: ing.unit,
          });
        }

        // Insert recipe
        const { data: newRecipe, error: recipeError } = await supabase
          .from('recipes')
          .insert({
            name: recipe.recipe_name,
            description: recipe.description || null,
            instructions: recipe.instructions || null,
            servings: recipe.servings,
            total_kcal: Math.round(totalKcal),
          })
          .select()
          .single();

        if (recipeError) throw recipeError;

        // Insert ingredients
        const ingredientsToInsert = ingredientsData.map(ing => ({
          recipe_id: newRecipe.id,
          ...ing,
        }));

        const { error: ingredientsError } = await supabase
          .from('recipe_ingredients')
          .insert(ingredientsToInsert);

        if (ingredientsError) throw ingredientsError;
      }

      toast.success(`Successfully imported ${validRecipes.length} recipes!`);
      setIsOpen(false);
      setParsedRecipes([]);
      onImportComplete();
    } catch (error: any) {
      toast.error(error.message || "Failed to import recipes");
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRecipes.filter(r => r.isValid).length;
  const invalidCount = parsedRecipes.length - validCount;
  const warningCount = parsedRecipes.filter(r => r.warnings.length > 0).length;

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" />
          Download Template
        </Button>
        <Button variant="outline" disabled={parsing} asChild>
          <label className="cursor-pointer">
            {parsing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import from Excel
              </>
            )}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
              disabled={parsing}
            />
          </label>
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Import Recipes Preview</DialogTitle>
            <DialogDescription>
              Review the recipes below. All ingredients must match existing ingredients in your database.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 mb-4">
            <Badge variant="default" className="bg-green-500">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {validCount} Valid
            </Badge>
            {invalidCount > 0 && (
              <Badge variant="destructive">
                <XCircle className="mr-1 h-3 w-3" />
                {invalidCount} Invalid
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="secondary">
                <AlertCircle className="mr-1 h-3 w-3" />
                {warningCount} Warnings
              </Badge>
            )}
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Row</TableHead>
                  <TableHead className="w-12">Status</TableHead>
                  <TableHead>Recipe Name</TableHead>
                  <TableHead className="text-center">Servings</TableHead>
                  <TableHead className="text-center">Ingredients</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedRecipes.map((recipe, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-xs">{recipe.rowNumber}</TableCell>
                    <TableCell>
                      {recipe.isValid ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : recipe.warnings.length > 0 && recipe.errors.length === 0 ? (
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{recipe.recipe_name}</TableCell>
                    <TableCell className="text-center">{recipe.servings}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{recipe.ingredients.length}</Badge>
                      {recipe.unmatchedIngredients.length > 0 && (
                        <span className="ml-2 text-xs text-destructive">
                          ({recipe.unmatchedIngredients.length} unmatched)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {recipe.errors.length > 0 && (
                          <div className="text-xs text-destructive space-y-1">
                            {recipe.errors.map((error, i) => (
                              <div key={i}>• {error}</div>
                            ))}
                          </div>
                        )}
                        {recipe.warnings.length > 0 && (
                          <div className="text-xs text-yellow-600 dark:text-yellow-500 space-y-1">
                            {recipe.warnings.map((warning, i) => (
                              <div key={i}>⚠ {warning}</div>
                            ))}
                          </div>
                        )}
                        {recipe.unmatchedIngredients.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Missing: {recipe.unmatchedIngredients.join(', ')}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importing || validCount === 0}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${validCount} Recipe${validCount !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
