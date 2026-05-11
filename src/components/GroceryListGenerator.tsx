import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShoppingCart, Copy, Printer, Check } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";

interface GroceryItem {
  name: string;
  quantity: string;
  unit: string;
}

interface GroceryCategory {
  name: string;
  items: GroceryItem[];
}

interface GroceryListGeneratorProps {
  planId: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  triggerButton?: React.ReactNode;
}

export const GroceryListGenerator = ({
  planId,
  weekNumber,
  startDate,
  endDate,
  triggerButton,
}: GroceryListGeneratorProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groceryList, setGroceryList] = useState<GroceryCategory[]>([]);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const generateGroceryList = async () => {
    setLoading(true);
    try {
      // Fetch all meal cards for this plan
      const { data: mealCards, error: fetchError } = await supabase
        .from("meal_cards")
        .select("ingredients, meal_name, day_number")
        .eq("plan_id", planId)
        .order("day_number");

      if (fetchError) throw fetchError;

      if (!mealCards || mealCards.length === 0) {
        toast.error("No meals found in this plan");
        return;
      }

      // Extract ingredients (filter out empty ones)
      const ingredients = mealCards
        .filter(card => card.ingredients && card.ingredients.trim())
        .map(card => card.ingredients);

      if (ingredients.length === 0) {
        toast.error("No ingredients found in meal cards");
        return;
      }

      // Call edge function to process with AI
      const { data, error } = await supabase.functions.invoke('generate-grocery-list', {
        body: { ingredients }
      });

      if (error) {
        console.error("Edge function error:", error);
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.categories || !Array.isArray(data.categories)) {
        throw new Error("Invalid response format from AI");
      }

      setGroceryList(data.categories);
      toast.success("Grocery list generated successfully!");

    } catch (error: any) {
      console.error("Error generating grocery list:", error);
      toast.error(error.message || "Failed to generate grocery list");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen && groceryList.length === 0) {
      generateGroceryList();
    }
  };

  const toggleItem = (categoryName: string, itemName: string) => {
    const key = `${categoryName}:${itemName}`;
    const newChecked = new Set(checkedItems);
    if (newChecked.has(key)) {
      newChecked.delete(key);
    } else {
      newChecked.add(key);
    }
    setCheckedItems(newChecked);
  };

  const isItemChecked = (categoryName: string, itemName: string) => {
    return checkedItems.has(`${categoryName}:${itemName}`);
  };

  const copyToClipboard = () => {
    let text = `🛒 Grocery List - Week ${weekNumber}\n`;
    text += `${formatDate(startDate)} - ${formatDate(endDate)}\n\n`;

    groceryList.forEach(category => {
      text += `${category.name}\n`;
      category.items.forEach(item => {
        const checked = isItemChecked(category.name, item.name) ? '✓' : '☐';
        text += `  ${checked} ${item.name} - ${item.quantity} ${item.unit}\n`;
      });
      text += '\n';
    });

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const printList = () => {
    window.print();
  };

  const getTotalItems = () => {
    return groceryList.reduce((sum, cat) => sum + cat.items.length, 0);
  };

  const getCheckedCount = () => {
    return checkedItems.size;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button variant="outline" size="sm">
            <ShoppingCart className="mr-2 h-4 w-4" />
            Generate Grocery List
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Grocery List - Week {weekNumber}
          </DialogTitle>
          <DialogDescription>
            {formatDate(startDate)} - {formatDate(endDate)}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : groceryList.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>No grocery list generated yet</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between py-2 border-b">
              <div className="text-sm text-muted-foreground">
                {getCheckedCount()} / {getTotalItems()} items checked
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={printList}
                >
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-6">
                {groceryList.map((category, catIndex) => (
                  <div key={catIndex} className="space-y-3">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <span className="text-2xl">
                        {category.name === "Produce" && "🥬"}
                        {category.name === "Proteins" && "🍗"}
                        {category.name === "Dairy" && "🥛"}
                        {category.name === "Grains" && "🌾"}
                        {category.name === "Spices & Seasonings" && "🧂"}
                        {category.name === "Pantry" && "🏺"}
                        {category.name === "Other" && "📦"}
                      </span>
                      {category.name} ({category.items.length})
                    </h3>
                    <div className="space-y-2 pl-4">
                      {category.items.map((item, itemIndex) => {
                        const isChecked = isItemChecked(category.name, item.name);
                        return (
                          <div
                            key={itemIndex}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleItem(category.name, item.name)}
                            />
                            <div className={`flex-1 ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                              <span className="font-medium">{item.name}</span>
                              <span className="text-muted-foreground ml-2">
                                - {item.quantity} {item.unit}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
