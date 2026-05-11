import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, Search, Loader2, Carrot, Download } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { IngredientsImport } from "./IngredientsImport";
import { createFoodItemTemplate } from "@/lib/importUtils";

interface Ingredient {
  id: string;
  name: string;
  category: string | null;
  serving_size: string;
  serving_unit: string;
  kcal_per_serving: number;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  created_at: string;
}

const ingredientSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  category: z.string().max(50, "Category must be less than 50 characters").optional(),
  serving_size: z.string().min(1, "Serving size is required"),
  serving_unit: z.string().min(1, "Serving unit is required").max(20, "Unit must be less than 20 characters"),
  kcal_per_serving: z.number().min(0, "Calories must be 0 or greater"),
  protein: z.number().min(0, "Protein must be 0 or greater").optional().nullable(),
  carbs: z.number().min(0, "Carbs must be 0 or greater").optional().nullable(),
  fats: z.number().min(0, "Fats must be 0 or greater").optional().nullable(),
});

type IngredientFormData = z.infer<typeof ingredientSchema>;

const FormFields = ({
  formData,
  setFormData,
  saving,
  categories
}: {
  formData: IngredientFormData;
  setFormData: (data: IngredientFormData) => void;
  saving: boolean;
  categories: string[];
}) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="name">Ingredient Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Chicken Breast"
          disabled={saving}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select
          value={formData.category}
          onValueChange={(value) => setFormData({ ...formData, category: value })}
          disabled={saving}
        >
          <SelectTrigger id="category">
            <SelectValue placeholder="Select or type category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
            <SelectItem value="new">+ Add New Category</SelectItem>
          </SelectContent>
        </Select>
        {formData.category === "new" && (
          <Input
            placeholder="Enter new category name"
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            disabled={saving}
          />
        )}
      </div>
    </div>

    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label htmlFor="serving_size">Serving Size *</Label>
        <Input
          id="serving_size"
          value={formData.serving_size}
          onChange={(e) => setFormData({ ...formData, serving_size: e.target.value })}
          placeholder="e.g., 100, 1"
          disabled={saving}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="serving_unit">Unit *</Label>
        <Input
          id="serving_unit"
          value={formData.serving_unit}
          onChange={(e) => setFormData({ ...formData, serving_unit: e.target.value })}
          placeholder="e.g., g, cup, piece"
          disabled={saving}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="kcal">Calories (kcal) *</Label>
        <Input
          id="kcal"
          type="number"
          value={formData.kcal_per_serving}
          onChange={(e) => setFormData({ ...formData, kcal_per_serving: parseFloat(e.target.value) || 0 })}
          placeholder="e.g., 165"
          disabled={saving}
        />
      </div>
    </div>

    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label htmlFor="protein">Protein (g)</Label>
        <Input
          id="protein"
          type="number"
          step="0.1"
          value={formData.protein ?? ""}
          onChange={(e) => setFormData({ ...formData, protein: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="e.g., 31"
          disabled={saving}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="carbs">Carbs (g)</Label>
        <Input
          id="carbs"
          type="number"
          step="0.1"
          value={formData.carbs ?? ""}
          onChange={(e) => setFormData({ ...formData, carbs: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="e.g., 0"
          disabled={saving}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fats">Fats (g)</Label>
        <Input
          id="fats"
          type="number"
          step="0.1"
          value={formData.fats ?? ""}
          onChange={(e) => setFormData({ ...formData, fats: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="e.g., 3.6"
          disabled={saving}
        />
      </div>
    </div>
  </div>
);

export function IngredientsManager() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<IngredientFormData>({
    name: "",
    category: "",
    serving_size: "",
    serving_unit: "",
    kcal_per_serving: 0,
    protein: null,
    carbs: null,
    fats: null,
  });

  const fetchIngredients = async () => {
    const { data, error } = await supabase
      .from("ingredients")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;
    return data || [];
  };

  const { data: ingredients = [], isLoading } = useQuery({
    queryKey: ['ingredients'],
    queryFn: fetchIngredients,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['ingredient-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingredients")
        .select("category")
        .not("category", "is", null)
        .order("category", { ascending: true });

      if (error) throw error;

      const uniqueCategories = [...new Set(data.map(item => item.category).filter(Boolean))] as string[];
      return uniqueCategories;
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      category: "",
      serving_size: "",
      serving_unit: "",
      kcal_per_serving: 0,
      protein: null,
      carbs: null,
      fats: null,
    });
    setEditingItem(null);
  };

  const handleAdd = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleEdit = (item: Ingredient) => {
    setFormData({
      name: item.name,
      category: item.category || "",
      serving_size: String(item.serving_size), // Ensure string type
      serving_unit: String(item.serving_unit), // Ensure string type
      kcal_per_serving: Number(item.kcal_per_serving) || 0, // Ensure number type
      protein: item.protein !== null ? Number(item.protein) : null,
      carbs: item.carbs !== null ? Number(item.carbs) : null,
      fats: item.fats !== null ? Number(item.fats) : null,
    });
    setEditingItem(item);
  };

  const handleSave = async () => {
    try {
      const validatedData = ingredientSchema.parse(formData);
      setSaving(true);

      const dbData = {
        name: validatedData.name,
        category: validatedData.category || null,
        serving_size: validatedData.serving_size,
        serving_unit: validatedData.serving_unit,
        kcal_per_serving: validatedData.kcal_per_serving,
        protein: validatedData.protein,
        carbs: validatedData.carbs,
        fats: validatedData.fats,
      };

      if (editingItem) {
        const { error } = await supabase
          .from("ingredients")
          .update(dbData)
          .eq("id", editingItem.id);

        if (error) throw error;
        toast.success("Ingredient updated successfully!");
      } else {
        const { error } = await supabase
          .from("ingredients")
          .insert(dbData);

        if (error) throw error;
        toast.success("Ingredient created successfully!");
      }

      setIsAddDialogOpen(false);
      setEditingItem(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['ingredient-categories'] });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        toast.error(firstError.message);
      } else {
        toast.error(error.message || "Failed to save ingredient");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("ingredients")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Ingredient deleted successfully!");
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    } catch (error: any) {
      toast.error(error.message || "Failed to delete ingredient");
    } finally {
      setDeleteItemId(null);
    }
  };

  const handleDownloadTemplate = () => {
    createFoodItemTemplate("ingredients_template.xlsx");
    toast.success("Template downloaded!");
  };

  const filteredItems = ingredients.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Ingredients Database</CardTitle>
              <CardDescription>Manage base ingredients for recipe creation</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end">
              <Button variant="outline" onClick={handleDownloadTemplate} size="sm" className="flex-1 sm:flex-none">
                <Download className="mr-2 h-4 w-4" />
                Template
              </Button>
              <IngredientsImport onImportComplete={() => {
                queryClient.invalidateQueries({ queryKey: ['ingredients'] });
                queryClient.invalidateQueries({ queryKey: ['ingredient-categories'] });
              }} />
              <Button onClick={handleAdd} size="sm" className="flex-1 sm:flex-none">
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading ingredients...</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Carrot className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">
                {searchQuery ? "No ingredients found" : "No ingredients yet"}
              </p>
              <p className="text-sm">
                {searchQuery ? "Try a different search term" : "Add your first ingredient to get started"}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Serving</TableHead>
                    <TableHead className="text-right">Kcal</TableHead>
                    <TableHead className="text-right">Protein (g)</TableHead>
                    <TableHead className="text-right">Carbs (g)</TableHead>
                    <TableHead className="text-right">Fats (g)</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.category || "—"}</TableCell>
                      <TableCell>
                        {item.serving_size} {item.serving_unit}
                      </TableCell>
                      <TableCell className="text-right">{item.kcal_per_serving}</TableCell>
                      <TableCell className="text-right">{item.protein ?? "—"}</TableCell>
                      <TableCell className="text-right">{item.carbs ?? "—"}</TableCell>
                      <TableCell className="text-right">{item.fats ?? "—"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteItemId(item.id)}
                        >
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
            Showing {filteredItems.length} of {ingredients.length} ingredients
          </div>
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen || !!editingItem} onOpenChange={(open) => {
        if (!open) {
          setIsAddDialogOpen(false);
          setEditingItem(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="p-6 pb-4 shrink-0">
            <DialogTitle>{editingItem ? "Edit Ingredient" : "Add Ingredient"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the ingredient details" : "Add a new ingredient to your database"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 min-h-0">
            <FormFields formData={formData} setFormData={setFormData} saving={saving} categories={categories} />
          </div>

          <DialogFooter className="p-6 pt-4 shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                setEditingItem(null);
                resetForm();
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ingredient</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this ingredient? This will also remove it from all recipes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteItemId && handleDelete(deleteItemId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
