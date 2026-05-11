import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, FileText, Utensils } from "lucide-react";
import { toast } from "sonner";
import { GroceryListGenerator } from "@/components/GroceryListGenerator";
import { WeeklyPlanDownloader } from "@/components/WeeklyPlanDownloader";
import { formatDate } from "@/lib/formatters";

interface WeeklyPlan {
  id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  status: string | null;
  total_kcal: number | null;
  pdf_url: string | null;
}

interface MealCard {
  id: string;
  day_number: number;
  meal_type: string;
  meal_name: string;
  description: string | null;
  ingredients: string | null;
  instructions: string | null;
  kcal: number;
}

interface WeeklyPlanViewerProps {
  clientId: string;
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  cleansing_water: "Cleansing Water",
  early_morning: "Early Morning",
  breakfast: "Breakfast",
  mid_breakfast: "Mid Breakfast",
  lunch: "Lunch",
  evening_snack_1: "Evening Snack 1",
  evening_snack_2: "Evening Snack 2",
  dinner: "Dinner",
};

const MEAL_TYPE_ICONS: Record<string, string> = {
  cleansing_water: "💧",
  early_morning: "🌅",
  breakfast: "🥣",
  mid_breakfast: "🍎",
  lunch: "🍲",
  evening_snack_1: "🍿",
  evening_snack_2: "🥜",
  dinner: "🥗",
};

export function WeeklyPlanViewer({ clientId }: WeeklyPlanViewerProps) {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [mealCards, setMealCards] = useState<MealCard[]>([]);
  const [currentDay, setCurrentDay] = useState(1);

  useEffect(() => {
    fetchPlans();
  }, [clientId]);

  useEffect(() => {
    if (selectedPlanId) {
      fetchMealCards(selectedPlanId);
    }
  }, [selectedPlanId]);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("weekly_plans")
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "published")
        .order("week_number", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setPlans(data);
        setSelectedPlanId(data[0].id); // Select most recent plan
      } else {
        setPlans([]);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load plans");
    } finally {
      setLoading(false);
    }
  };

  const fetchMealCards = async (planId: string) => {
    try {
      const { data, error } = await supabase
        .from("meal_cards")
        .select("*")
        .eq("plan_id", planId)
        .order("day_number", { ascending: true })
        .order("meal_type", { ascending: true });

      if (error) throw error;

      setMealCards(data || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load meal cards");
    }
  };

  const getMealCardsForDay = (day: number) => {
    const dayCards = mealCards.filter(card => card.day_number === day);
    // Sort by meal type order
    const mealOrder = ["cleansing_water", "early_morning", "breakfast", "mid_breakfast", "lunch", "evening_snack_1", "evening_snack_2", "dinner"];
    return dayCards.sort((a, b) =>
      mealOrder.indexOf(a.meal_type) - mealOrder.indexOf(b.meal_type)
    );
  };

  const getDayTotalKcal = (day: number) => {
    return getMealCardsForDay(day).reduce((sum, card) => sum + (card.kcal || 0), 0);
  };

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (plans.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weekly Plan</CardTitle>
          <CardDescription>Your personalized meal plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">No active plan available</p>
            <p className="text-sm">Your dietitian will create a personalized plan for you</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan Selector */}
      {plans.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {plans.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`px-4 py-2 rounded-lg border transition-colors ${selectedPlanId === plan.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted"
                    }`}
                >
                  Week {plan.week_number}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Details */}
      {selectedPlan && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Week {selectedPlan.week_number} Plan
                </CardTitle>
                <CardDescription className="mt-1">
                  {formatDate(selectedPlan.start_date)} - {formatDate(selectedPlan.end_date)}
                </CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Weekly</p>
                  <p className="text-2xl font-bold">{selectedPlan.total_kcal || 0} kcal</p>
                </div>
                <GroceryListGenerator
                  planId={selectedPlan.id}
                  weekNumber={selectedPlan.week_number}
                  startDate={selectedPlan.start_date}
                  endDate={selectedPlan.end_date}
                />
                <WeeklyPlanDownloader
                  planId={selectedPlan.id}
                  weekNumber={selectedPlan.week_number}
                  startDate={selectedPlan.start_date}
                  endDate={selectedPlan.end_date}
                />
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Meal Cards by Day */}
      {mealCards.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Utensils className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">No meal cards yet</p>
              <p className="text-sm">Meal plans are being prepared for this week</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Tabs value={`day-${currentDay}`} onValueChange={(v) => setCurrentDay(parseInt(v.split("-")[1]))}>
              <div className="border-b p-4 overflow-x-auto">
                <TabsList className="inline-flex w-full min-w-max sm:w-auto h-auto p-1">
                  {[1, 2, 3, 4, 5, 6, 7].map(day => (
                    <TabsTrigger key={day} value={`day-${day}`} className="flex-1 min-w-[70px]">
                      <div className="flex flex-col items-center py-1">
                        <span className="text-[10px] uppercase text-muted-foreground">Day</span>
                        <span className="font-bold text-lg">{day}</span>
                      </div>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {[1, 2, 3, 4, 5, 6, 7].map(day => {
                const dayMeals = getMealCardsForDay(day);
                const dayKcal = getDayTotalKcal(day);

                return (
                  <TabsContent key={day} value={`day-${day}`} className="p-6 space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-semibold">Day {day}</h3>
                      <Badge variant="secondary" className="text-lg px-4 py-1">
                        {dayKcal} kcal
                      </Badge>
                    </div>

                    {dayMeals.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No meals planned for this day</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {dayMeals.map(card => (
                          <Card key={card.id} className="overflow-hidden">
                            <CardHeader className="bg-muted/50">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <span>{MEAL_TYPE_ICONS[card.meal_type]}</span>
                                  {MEAL_TYPE_LABELS[card.meal_type] || card.meal_type}
                                </CardTitle>
                                <Badge>{card.kcal} kcal</Badge>
                              </div>
                              <CardDescription className="text-base font-semibold text-foreground mt-1">
                                {card.meal_name}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                              {card.description && (
                                <div>
                                  <p className="text-sm text-muted-foreground">{card.description}</p>
                                </div>
                              )}

                              {card.ingredients && (
                                <div>
                                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                    🥗 Ingredients
                                  </h4>
                                  <p className="text-sm whitespace-pre-wrap">{card.ingredients}</p>
                                </div>
                              )}

                              {card.instructions && (
                                <div>
                                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                    👨‍🍳 Instructions
                                  </h4>
                                  <p className="text-sm whitespace-pre-wrap">{card.instructions}</p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
