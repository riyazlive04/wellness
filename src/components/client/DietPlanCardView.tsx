import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Utensils } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DietPlanCardViewProps {
  data: any;
  onDownloadPDF?: () => void;
}

export function DietPlanCardView({ data, onDownloadPDF }: DietPlanCardViewProps) {
  const diet = data?.diet_plan || data;

  return (
    <Card className="w-full">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Utensils className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-2xl">Diet Plan</CardTitle>
              <p className="text-sm text-muted-foreground">Your personalized nutrition guide</p>
            </div>
          </div>
          {onDownloadPDF && (
            <Button onClick={onDownloadPDF} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Plan Overview */}
        {(diet?.calorie_target || diet?.meals_per_day || diet?.diet_type) && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Plan Overview</h3>
            <div className="grid grid-cols-3 gap-4">
              {diet.calorie_target && (
                <div className="text-center p-4 rounded-lg bg-muted">
                  <p className="text-2xl font-bold text-primary">{diet.calorie_target}</p>
                  <p className="text-xs text-muted-foreground">Daily Calories</p>
                </div>
              )}
              {diet.meals_per_day && (
                <div className="text-center p-4 rounded-lg bg-muted">
                  <p className="text-2xl font-bold text-primary">{diet.meals_per_day}</p>
                  <p className="text-xs text-muted-foreground">Meals per Day</p>
                </div>
              )}
              {diet.diet_type && (
                <div className="text-center p-4 rounded-lg bg-muted">
                  <Badge variant="outline" className="text-sm">{diet.diet_type}</Badge>
                  <p className="text-xs text-muted-foreground mt-1">Diet Type</p>
                </div>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Meal Plan Table */}
        {diet?.meal_schedule && diet.meal_schedule.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Daily Meal Schedule</h3>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Meal</TableHead>
                    <TableHead>Foods</TableHead>
                    <TableHead className="text-right">Calories</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diet.meal_schedule.map((meal: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{meal.time}</TableCell>
                      <TableCell>{meal.meal_type || meal.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {Array.isArray(meal.foods) ? meal.foods.join(", ") : meal.foods}
                      </TableCell>
                      <TableCell className="text-right">{meal.calories} kcal</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <Separator />

        {/* Food Preferences */}
        {(diet?.preferences || diet?.allergies || diet?.food_dislikes) && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Food Preferences & Restrictions</h3>
            <div className="space-y-4">
              {diet.preferences && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Dietary Preferences</p>
                  <p className="text-sm">{diet.preferences}</p>
                </div>
              )}
              {diet.allergies && diet.allergies.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Allergies</p>
                  <div className="flex flex-wrap gap-2">
                    {diet.allergies.map((allergy: string, idx: number) => (
                      <Badge key={idx} variant="destructive">{allergy}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {diet.food_dislikes && diet.food_dislikes.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Foods to Avoid</p>
                  <div className="flex flex-wrap gap-2">
                    {diet.food_dislikes.map((food: string, idx: number) => (
                      <Badge key={idx} variant="outline">{food}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Nutritional Guidelines */}
        {diet?.nutritional_guidelines && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Nutritional Guidelines</h3>
            <div className="space-y-2">
              {diet.nutritional_guidelines.map((guideline: string, idx: number) => (
                <div key={idx} className="flex items-start gap-2 p-3 rounded-lg bg-muted">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span className="text-sm flex-1">{guideline}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hydration */}
        {diet?.hydration_target && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Hydration Goal</h3>
              <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-950/20">
                <p className="text-2xl font-bold text-blue-600">{diet.hydration_target}</p>
                <p className="text-sm text-muted-foreground mt-1">Daily water intake</p>
              </div>
            </div>
          </>
        )}

        {/* Supplements */}
        {diet?.supplements && diet.supplements.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Recommended Supplements</h3>
              <div className="grid gap-3">
                {diet.supplements.map((supplement: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-lg border">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{supplement.name}</p>
                        {supplement.dosage && (
                          <p className="text-sm text-muted-foreground">{supplement.dosage}</p>
                        )}
                      </div>
                      {supplement.timing && (
                        <Badge variant="outline" className="text-xs">{supplement.timing}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Notes */}
        {diet?.notes && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Important Notes</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{diet.notes}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
