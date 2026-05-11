import { useState, useEffect } from "react";
import { calculateNutrients, roundNutrients } from "@/lib/nutrition";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { MAX_FILE_SIZE, getAcceptString, getFileIcon, getFileDisplayName } from "@/lib/fileUtils";
import { sendAutomatedMessage } from "@/lib/messages";

interface MealPhotoUploadProps {
  clientId: string;
  onSuccess: () => void;
}

const MEAL_TYPES = [
  { value: "cleansing_water", label: "Cleansing Water" },
  { value: "early_morning", label: "Early Morning" },
  { value: "breakfast", label: "Breakfast" },
  { value: "mid_breakfast", label: "Mid Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "evening_snack_1", label: "Evening Snack 1" },
  { value: "evening_snack_2", label: "Evening Snack 2" },
  { value: "dinner", label: "Dinner" },
];

export function MealPhotoUpload({ clientId, onSuccess }: MealPhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mealType, setMealType] = useState<string>("");
  const [mealName, setMealName] = useState("");
  const [notes, setNotes] = useState("");
  const [kcal, setKcal] = useState("");
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [foodItems, setFoodItems] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [sourceType, setSourceType] = useState<'food_item' | 'ingredient' | ''>("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    fetchFoodOptions();
  }, []);

  const fetchFoodOptions = async () => {
    setLoadingItems(true);
    try {
      const [ingResp, foodResp] = await Promise.all([
        supabase.from('ingredients').select('*').order('name'),
        supabase.from('food_items').select('*').order('name')
      ]);
      if (ingResp.data) setIngredients(ingResp.data);
      if (foodResp.data) setFoodItems(foodResp.data);
    } catch (error) {
      console.error("Error fetching food options:", error);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE) {
        toast.error("File size must be less than 50MB");
        return;
      }

      setFile(selectedFile);

      // Create preview for images only
      if (selectedFile.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);
      } else {
        setPreview(null);
      }
    }
  };

  const clearForm = () => {
    setFile(null);
    setPreview(null);
    setMealType("");
    setMealName("");
    setNotes("");
    setKcal("");
    setSourceId("");
    setSourceType("");
    setQuantity("");
    setUnit("");
  };

  const handleSourceChange = (value: string) => {
    const [type, id] = value.split(':');
    const item = type === 'ingredient' 
      ? ingredients.find(i => i.id === id) 
      : foodItems.find(f => f.id === id);

    if (item) {
      setSourceId(id);
      setSourceType(type as any);
      const qty = parseFloat(item.serving_size) || 1;
      setQuantity(qty.toString());
      setUnit(item.serving_unit || "");
      setKcal(item.kcal_per_serving?.toString() || "");
      if (!mealName) setMealName(item.name);
    }
  };

  const handleQuantityChange = (qtyStr: string) => {
    setQuantity(qtyStr);
    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || !sourceId || !sourceType) return;

    const item = sourceType === 'ingredient'
      ? ingredients.find(i => i.id === sourceId)
      : foodItems.find(f => f.id === sourceId);

    if (item) {
      const nutrients = calculateNutrients(item, qty);
      setKcal(Math.round(nutrients.kcal).toString());
    }
  };

  const handleUpload = async () => {
    // Validate clientId first
    if (!clientId || clientId === "undefined") {
      console.error("Invalid clientId:", clientId);
      toast.error("Unable to identify your account. Please refresh the page.");
      return;
    }

    if (!file || !mealType) {
      toast.error("Please select a file and meal type");
      return;
    }



    setUploading(true);

    try {
      // Upload image to storage
      const fileName = `${clientId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("meal-photos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get or create today's daily log
      const today = new Date().toISOString().split("T")[0];
      let dailyLogId = null;

      const { data: existingLog } = await supabase
        .from("daily_logs")
        .select("id")
        .eq("client_id", clientId)
        .eq("log_date", today)
        .maybeSingle();

      if (existingLog) {
        dailyLogId = existingLog.id;
      } else {
        // Create today's log if it doesn't exist
        try {
          const { data: newLog, error: createError } = await supabase
            .from("daily_logs")
            .insert({
              client_id: clientId,
              log_date: today
            })
            .select("id")
            .single();

          if (createError) {
            // If duplicate key error (race condition), fetch the existing one
            if (createError.code === '23505') {
              const { data: retryLog } = await supabase
                .from("daily_logs")
                .select("id")
                .eq("client_id", clientId)
                .eq("log_date", today)
                .single();
              if (retryLog) dailyLogId = retryLog.id;
            } else {
              throw createError;
            }
          } else if (newLog) {
            dailyLogId = newLog.id;
          }
        } catch (err) {
          console.error("Error ensuring daily log exists:", err);
          // We continue without dailyLogId if creation fails, relying on meal_logs standalone
        }
      }

      // Insert meal log with file path and file type
      const { error: dbError } = await supabase
        .from("meal_logs")
        .insert({
          client_id: clientId,
          daily_log_id: dailyLogId,
          meal_type: mealType as "breakfast" | "lunch" | "evening_snack" | "dinner",
          meal_name: mealName || null,
          photo_url: fileName, // Store path, not public URL
          file_type: file.type, // Store file MIME type
          notes: notes || null,
          kcal: kcal ? parseInt(kcal) : null,
          source_id: sourceId || null,
          source_type: sourceType || null,
          quantity: quantity ? parseFloat(quantity) : null,
          unit: unit || null,
          logged_at: new Date().toISOString(),
        });

      if (dbError) throw dbError;

      toast.success("Meal file uploaded successfully!");
      clearForm();
      onSuccess();

      // Send automated message
      const mealTypeLabels = {
        cleansing_water: 'Cleansing Water',
        early_morning: 'Early Morning',
        breakfast: 'Breakfast',
        mid_breakfast: 'Mid Breakfast',
        lunch: 'Lunch',
        evening_snack_1: 'Evening Snack 1',
        evening_snack_2: 'Evening Snack 2',
        dinner: 'Dinner'
      };

      await sendAutomatedMessage(clientId, `meal_logged_${mealType}`, {
        name: '', // Will be filled by edge function if needed
        meal_type: mealTypeLabels[mealType as keyof typeof mealTypeLabels],
        time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      }).catch(err => console.error('Error sending meal log message:', err));

      // Trigger push notification for staff
      supabase.functions.invoke('send-push-notification', {
        body: {
          target_roles: ['admin', 'manager'],
          title: 'New Meal Log',
          body: `${mealName || 'A client'} just logged ${mealTypeLabels[mealType as keyof typeof mealTypeLabels]}.`,
          url: `/admin/client/${clientId}`, 
        }
      }).catch(err => console.error('Error notifying staff of meal log:', err));

    } catch (error: any) {
      console.error("Meal log error:", error);
      toast.error(error.message || "Failed to upload meal file");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Log Your Meal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="photo">Meal File (Photo, PDF, Document, etc.)</Label>
          <div className="mt-2">
            {file ? (
              <div className="relative">
                {preview ? (
                  <div className="relative inline-block">
                    <img src={preview} alt="Preview" className="max-w-full h-48 rounded-lg object-cover" />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        setFile(null);
                        setPreview(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted">
                    {(() => {
                      const FileIcon = getFileIcon(file.type);
                      return <FileIcon className="h-8 w-8 text-muted-foreground flex-shrink-0" />;
                    })()}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {getFileDisplayName(file.type)} • {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFile(null);
                        setPreview(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
                <Upload className="h-12 w-12 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground mb-1">Click to select file</span>
                <span className="text-xs text-muted-foreground">Images, PDFs, Documents, Audio, Video (max 50MB)</span>
                <Input
                  id="photo"
                  type="file"
                  accept={getAcceptString()}
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="mealType">Meal Type</Label>
            <Select value={mealType} onValueChange={setMealType} disabled={uploading}>
              <SelectTrigger id="mealType">
                <SelectValue placeholder="Select meal type" />
              </SelectTrigger>
              <SelectContent>
                {MEAL_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Find Food (Optional)</Label>
            <Select 
              onValueChange={handleSourceChange} 
              disabled={uploading || loadingItems}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingItems ? "Loading..." : "Search ingredients/food..."} />
              </SelectTrigger>
              <SelectContent>
                {ingredients.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">Ingredients</div>
                    {ingredients.map(ing => (
                      <SelectItem key={ing.id} value={`ingredient:${ing.id}`}>
                        {ing.name} ({ing.kcal_per_serving} kcal)
                      </SelectItem>
                    ))}
                  </>
                )}
                {foodItems.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">Common Food</div>
                    {foodItems.map(item => (
                      <SelectItem key={item.id} value={`food_item:${item.id}`}>
                        {item.name} ({item.kcal_per_serving} kcal)
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="mealName">Meal Name (Optional)</Label>
          <Input
            id="mealName"
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            placeholder="e.g., Grilled Chicken Salad"
            disabled={uploading}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              step="0.1"
              value={quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              placeholder="Qty"
              disabled={uploading}
            />
          </div>
          <div className="col-span-1">
            <Label htmlFor="unit">Unit</Label>
            <Input
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g., g, ml"
              disabled={uploading}
            />
          </div>
          <div className="col-span-1">
            <Label htmlFor="kcal">Calories</Label>
            <Input
              id="kcal"
              type="number"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              placeholder="kcal"
              disabled={uploading}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this meal..."
            rows={2}
            disabled={uploading}
          />
        </div>

        <Button onClick={handleUpload} disabled={uploading || !file || !mealType} className="w-full">
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Log Meal
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
