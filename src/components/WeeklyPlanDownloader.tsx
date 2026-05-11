import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";

interface MealCard {
    day_number: number;
    meal_type: string;
    meal_name: string;
    description: string | null;
    ingredients: string | null;
    instructions: string | null;
    kcal: number;
}

interface WeeklyPlanDownloaderProps {
    planId: string;
    weekNumber: number;
    startDate: string;
    endDate: string;
    triggerButton?: React.ReactNode;
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

export function WeeklyPlanDownloader({
    planId,
    weekNumber,
    startDate,
    endDate,
    triggerButton,
}: WeeklyPlanDownloaderProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mealCards, setMealCards] = useState<MealCard[]>([]);

    useEffect(() => {
        if (open) {
            fetchMealCards();
        }
    }, [open, planId]);

    const fetchMealCards = async () => {
        setLoading(true);
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
            toast.error(error.message || "Failed to load meal plan");
        } finally {
            setLoading(false);
        }
    };

    const getMealCardsForDay = (day: number) => {
        return mealCards.filter(card => card.day_number === day);
    };

    const getDayTotalKcal = (day: number) => {
        return getMealCardsForDay(day).reduce((sum, card) => sum + (card.kcal || 0), 0);
    };

    const getTotalKcal = () => {
        return mealCards.reduce((sum, card) => sum + (card.kcal || 0), 0);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {triggerButton || (
                    <Button variant="outline" size="sm">
                        <Download className="mr-2 h-4 w-4" />
                        Download Plan
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:max-w-full print:max-h-full">
                <DialogHeader className="print:hidden">
                    <DialogTitle className="flex items-center justify-between">
                        <span>Weekly Meal Plan - Week {weekNumber}</span>
                        <Button onClick={handlePrint} variant="outline" size="sm">
                            <Printer className="mr-2 h-4 w-4" />
                            Print / Save as PDF
                        </Button>
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-6 print:p-8">
                        {/* Print Header */}
                        <div className="hidden print:block text-center border-b pb-4 mb-6">
                            <h1 className="text-3xl font-bold mb-2">Weekly Meal Plan</h1>
                            <p className="text-lg">Week {weekNumber}</p>
                            <p className="text-sm text-gray-600">
                                {formatDate(startDate)} - {formatDate(endDate)}
                            </p>
                            <p className="text-sm font-semibold mt-2">
                                Total Weekly Calories: {getTotalKcal()} kcal
                            </p>
                        </div>

                        {/* Screen Header */}
                        <div className="print:hidden border-b pb-4">
                            <h2 className="text-2xl font-bold">Week {weekNumber}</h2>
                            <p className="text-sm text-muted-foreground">
                                {formatDate(startDate)} - {formatDate(endDate)}
                            </p>
                            <p className="text-sm font-semibold mt-1">
                                Total: {getTotalKcal()} kcal
                            </p>
                        </div>

                        {/* Days */}
                        {[1, 2, 3, 4, 5, 6, 7].map(day => {
                            const dayMeals = getMealCardsForDay(day);
                            const dayKcal = getDayTotalKcal(day);

                            return (
                                <div key={day} className="border rounded-lg p-4 print:break-inside-avoid print:border-2">
                                    <div className="flex items-center justify-between mb-4 border-b pb-2">
                                        <h3 className="text-xl font-bold">Day {day}</h3>
                                        <span className="text-sm font-semibold bg-gray-100 px-3 py-1 rounded print:bg-gray-200">
                                            {dayKcal} kcal
                                        </span>
                                    </div>

                                    {dayMeals.length === 0 ? (
                                        <p className="text-sm text-muted-foreground italic">No meals planned</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {dayMeals.map((card, idx) => (
                                                <div key={idx} className="border-l-4 border-primary pl-3 print:border-l-2">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <h4 className="font-semibold text-sm">
                                                            {MEAL_TYPE_LABELS[card.meal_type] || card.meal_type}
                                                        </h4>
                                                        <span className="text-xs font-medium text-gray-600">
                                                            {card.kcal} kcal
                                                        </span>
                                                    </div>
                                                    <p className="font-medium text-base mb-1">{card.meal_name}</p>

                                                    {card.description && (
                                                        <p className="text-sm text-gray-600 mb-2">{card.description}</p>
                                                    )}

                                                    {card.ingredients && (
                                                        <div className="text-sm mb-2">
                                                            <span className="font-semibold">Ingredients: </span>
                                                            <span className="text-gray-700">{card.ingredients}</span>
                                                        </div>
                                                    )}

                                                    {card.instructions && (
                                                        <div className="text-sm">
                                                            <span className="font-semibold">Instructions: </span>
                                                            <span className="text-gray-700">{card.instructions}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Print Footer */}
                        <div className="hidden print:block text-center text-sm text-gray-500 mt-8 pt-4 border-t">
                            <p>Sheizen Wellness - Personalized Nutrition Plan</p>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
