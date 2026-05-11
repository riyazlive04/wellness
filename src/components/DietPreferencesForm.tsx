import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UtensilsCrossed } from "lucide-react";

const dietPreferencesSchema = z.object({
  dietaryType: z.enum(["veg", "non_veg", "vegan"], {
    required_error: "Please select a dietary type",
  }),
  foodDislikes: z.string().optional(),
  mealsPerDay: z.string().refine((val) => {
    const num = parseInt(val);
    return num >= 3 && num <= 5;
  }, "Must be between 3 and 5 meals"),
  breakfastTime: z.string().min(1, "Breakfast time required"),
  lunchTime: z.string().min(1, "Lunch time required"),
  eveningSnackTime: z.string().min(1, "Evening snack time required"),
  dinnerTime: z.string().min(1, "Dinner time required"),
  calorieTarget: z.string().min(1, "Calorie target required"),
  allergies: z.string().optional(),
  preferencesNotes: z.string().optional(),
});

type DietPreferencesFormData = z.infer<typeof dietPreferencesSchema>;

interface DietPreferencesFormProps {
  clientId: string;
  onSave?: () => void;
}

export function DietPreferencesForm({ clientId, onSave }: DietPreferencesFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [existingPreferences, setExistingPreferences] = useState<any>(null);

  const form = useForm<DietPreferencesFormData>({
    resolver: zodResolver(dietPreferencesSchema),
    defaultValues: {
      dietaryType: "veg",
      foodDislikes: "",
      mealsPerDay: "4",
      breakfastTime: "08:00",
      lunchTime: "13:00",
      eveningSnackTime: "17:00",
      dinnerTime: "20:00",
      calorieTarget: "",
      allergies: "",
      preferencesNotes: "",
    },
  });

  useEffect(() => {
    loadPreferences();
  }, [clientId]);

  const loadPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('diet_preferences')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setExistingPreferences(data);
        const mealTimings = data.meal_timings as any || {};
        
        const dietaryType = data.dietary_type === "veg" || data.dietary_type === "non_veg" || data.dietary_type === "vegan"
          ? data.dietary_type
          : "veg";
        
        form.reset({
          dietaryType,
          foodDislikes: Array.isArray(data.food_dislikes) ? data.food_dislikes.join(", ") : "",
          mealsPerDay: String(data.meals_per_day || 4),
          breakfastTime: mealTimings.breakfast || "08:00",
          lunchTime: mealTimings.lunch || "13:00",
          eveningSnackTime: mealTimings.evening_snack || "17:00",
          dinnerTime: mealTimings.dinner || "20:00",
          calorieTarget: String(data.calorie_target || ""),
          allergies: Array.isArray(data.allergies) ? data.allergies.join(", ") : "",
          preferencesNotes: data.preferences_notes || "",
        });
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      toast({
        title: "Error",
        description: "Failed to load diet preferences",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: DietPreferencesFormData) => {
    setIsSaving(true);
    try {
      const foodDislikesArray = data.foodDislikes
        ? data.foodDislikes.split(',').map(item => item.trim()).filter(Boolean)
        : [];

      const allergiesArray = data.allergies
        ? data.allergies.split(',').map(item => item.trim()).filter(Boolean)
        : [];

      const mealTimings = {
        breakfast: data.breakfastTime,
        lunch: data.lunchTime,
        evening_snack: data.eveningSnackTime,
        dinner: data.dinnerTime,
      };

      const payload = {
        client_id: clientId,
        dietary_type: data.dietaryType,
        food_dislikes: foodDislikesArray,
        meals_per_day: parseInt(data.mealsPerDay),
        meal_timings: mealTimings,
        calorie_target: parseInt(data.calorieTarget),
        allergies: allergiesArray,
        preferences_notes: data.preferencesNotes || null,
      };

      if (existingPreferences) {
        const { error } = await supabase
          .from('diet_preferences')
          .update(payload)
          .eq('id', existingPreferences.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('diet_preferences')
          .insert(payload);

        if (error) throw error;
      }

      toast({
        title: "Preferences Saved",
        description: "Diet preferences have been saved successfully.",
      });

      onSave?.();
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error",
        description: "Failed to save diet preferences",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UtensilsCrossed className="h-5 w-5" />
          Diet Preferences
        </CardTitle>
        <CardDescription>
          Configure dietary preferences for personalized meal planning
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dietaryType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dietary Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="veg">Vegetarian</SelectItem>
                        <SelectItem value="non_veg">Non-Vegetarian</SelectItem>
                        <SelectItem value="vegan">Vegan</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mealsPerDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meals Per Day</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="3">3 Meals</SelectItem>
                        <SelectItem value="4">4 Meals</SelectItem>
                        <SelectItem value="5">5 Meals</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3">
              <FormLabel>Meal Timings</FormLabel>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="breakfastTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-muted-foreground">Breakfast</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lunchTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-muted-foreground">Lunch</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="eveningSnackTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-muted-foreground">Evening Snack</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dinnerTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-muted-foreground">Dinner</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="calorieTarget"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Daily Calorie Target (kcal)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 1800" {...field} />
                  </FormControl>
                  <FormDescription>
                    Target daily caloric intake for meal planning
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="foodDislikes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Food Dislikes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., paneer, brinjal, mushrooms (comma separated)"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    List foods to avoid in meal plans, separated by commas
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="allergies"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Food Allergies (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., nuts, dairy, gluten (comma separated)" {...field} />
                  </FormControl>
                  <FormDescription>
                    Important: Foods that must be completely avoided
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="preferencesNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any other dietary preferences, cultural requirements, or special considerations"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? "Saving..." : existingPreferences ? "Update Preferences" : "Save Preferences"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
