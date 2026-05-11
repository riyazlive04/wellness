import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, ChefHat, PlayCircle, Clock, Users, Flame, Utensils } from "lucide-react";
import { toast } from "sonner";

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

interface RecipeIngredient {
    id: string;
    quantity: number;
    unit: string;
    ingredients: {
        name: string;
        kcal_per_serving: number;
        serving_size: string;
        serving_unit: string;
    };
}

export function ClientRecipeList() {
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
    const [ingredientsLoading, setIngredientsLoading] = useState(false);

    useEffect(() => {
        fetchRecipes();
    }, []);

    const fetchRecipes = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("recipes")
                .select("*")
                .order("name", { ascending: true });

            if (error) throw error;
            setRecipes((data as any) || []);
        } catch (error: any) {
            toast.error("Failed to load recipes");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const loadRecipeDetails = async (recipe: Recipe) => {
        setSelectedRecipe(recipe);
        setIngredientsLoading(true);
        try {
            const { data, error } = await supabase
                .from("recipe_ingredients")
                .select("*, ingredients:ingredients!recipe_ingredients_ingredient_id_fkey(*)")
                .eq("recipe_id", recipe.id);

            if (error) throw error;
            setRecipeIngredients(data || []);
        } catch (error) {
            console.error(error);
            toast.error("Failed to load ingredients");
        } finally {
            setIngredientsLoading(false);
        }
    };

    const getEmbedUrl = (url: string | null) => {
        if (!url) return null;

        // Simple parser for YouTube/Vimeo
        // YouTube: https://www.youtube.com/watch?v=VIDEO_ID -> https://www.youtube.com/embed/VIDEO_ID
        // YouTube Short: https://youtu.be/VIDEO_ID -> https://www.youtube.com/embed/VIDEO_ID

        try {
            if (url.includes("youtube.com") || url.includes("youtu.be")) {
                let videoId = "";
                if (url.includes("v=")) {
                    videoId = url.split("v=")[1].split("&")[0];
                } else if (url.includes("youtu.be/")) {
                    videoId = url.split("youtu.be/")[1];
                }

                if (videoId) {
                    return `https://www.youtube.com/embed/${videoId}`;
                }
            }
            // Vimeo logic could go here
        } catch (e) {
            console.error("Error parsing video URL", e);
        }

        return url; // Return original if can't parse, or handle generic iframe
    };

    const filteredRecipes = recipes.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Recipe Library</h2>
                    <p className="text-muted-foreground">Discover healthy and delicious meals</p>
                </div>
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search recipes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <Card key={i} className="animate-pulse">
                            <CardHeader className="h-32 bg-muted/50" />
                            <CardContent className="h-32 p-6" />
                        </Card>
                    ))}
                </div>
            ) : filteredRecipes.length === 0 ? (
                <div className="text-center py-16 bg-muted/20 rounded-lg">
                    <ChefHat className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-lg font-medium text-muted-foreground">No recipes found matching your search</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredRecipes.map((recipe) => (
                        <Card key={recipe.id} className="group hover:shadow-lg transition-all duration-300 border-l-4 border-l-transparent hover:border-l-primary flex flex-col">
                            <CardHeader>
                                <div className="flex justify-between items-start gap-2">
                                    <CardTitle className="line-clamp-2 text-lg">{recipe.name}</CardTitle>
                                    {recipe.video_url && (
                                        <Badge variant="secondary" className="shrink-0 gap-1 bg-red-100 text-red-700 hover:bg-red-200 border-transparent">
                                            <PlayCircle className="w-3 h-3" />
                                            Video
                                        </Badge>
                                    )}
                                </div>
                                <CardDescription className="line-clamp-2 mt-2">
                                    {recipe.description || "No description available"}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1 space-y-4">
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Users className="w-4 h-4" />
                                        <span>{recipe.servings} srv</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Flame className="w-4 h-4" />
                                        <span>{recipe.total_kcal ? Math.round(recipe.total_kcal / recipe.servings) : "--"} kcal</span>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="pt-4 border-t bg-muted/40 group-hover:bg-muted/60 transition-colors">
                                <Button className="w-full" onClick={() => loadRecipeDetails(recipe)}>
                                    View Recipe
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}

            {/* Recipe Details Dialog */}
            <Dialog open={!!selectedRecipe} onOpenChange={(open) => !open && setSelectedRecipe(null)}>
                <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
                    {selectedRecipe && (
                        <>
                            <ScrollArea className="flex-1">
                                <div className="p-6 space-y-8">
                                    <DialogHeader>
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            <Badge variant="outline" className="gap-1">
                                                <Users className="w-3 h-3" />
                                                {selectedRecipe.servings} Servings
                                            </Badge>
                                            <Badge variant="outline" className="gap-1">
                                                <Flame className="w-3 h-3" />
                                                {selectedRecipe.total_kcal ? Math.round(selectedRecipe.total_kcal / selectedRecipe.servings) : "--"} kcal/serving
                                            </Badge>
                                        </div>
                                        <DialogTitle className="text-2xl font-bold">{selectedRecipe.name}</DialogTitle>
                                        {selectedRecipe.description && (
                                            <DialogDescription className="text-base mt-2">
                                                {selectedRecipe.description}
                                            </DialogDescription>
                                        )}
                                    </DialogHeader>

                                    {/* Video Section */}
                                    {selectedRecipe.video_url && (
                                        <div className="rounded-xl overflow-hidden bg-black aspect-video shadow-md">
                                            <iframe
                                                src={getEmbedUrl(selectedRecipe.video_url)!}
                                                className="w-full h-full border-0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                                title={selectedRecipe.name}
                                            />
                                        </div>
                                    )}

                                    <div className="grid md:grid-cols-5 gap-8">
                                        {/* Ingredients Column */}
                                        <div className="md:col-span-2 space-y-4">
                                            <h3 className="font-semibold flex items-center gap-2">
                                                <Utensils className="w-4 h-4" />
                                                Ingredients
                                            </h3>
                                            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                                                {ingredientsLoading ? (
                                                    <div className="space-y-2">
                                                        <div className="h-4 bg-muted animate-pulse rounded w-3/4"></div>
                                                        <div className="h-4 bg-muted animate-pulse rounded w-1/2"></div>
                                                    </div>
                                                ) : recipeIngredients.length > 0 ? (
                                                    <ul className="space-y-2 text-sm">
                                                        {recipeIngredients.map((ing) => (
                                                            <li key={ing.id} className="flex justify-between items-start border-b border-border/50 last:border-0 pb-2 last:pb-0">
                                                                <span>{ing.ingredients?.name}</span>
                                                                <span className="font-medium text-muted-foreground whitespace-nowrap ml-2">
                                                                    {ing.quantity} {ing.unit}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">No ingredients listed.</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Instructions Column */}
                                        <div className="md:col-span-3 space-y-4">
                                            <h3 className="font-semibold flex items-center gap-2">
                                                <PlayCircle className="w-4 h-4" />
                                                Instructions
                                            </h3>
                                            {selectedRecipe.instructions ? (
                                                <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                                    {selectedRecipe.instructions}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground italic">No instructions provided.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </ScrollArea>

                            <div className="p-4 border-t bg-muted/40 shrink-0 flex justify-end">
                                <Button variant="outline" onClick={() => setSelectedRecipe(null)}>
                                    Close
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
