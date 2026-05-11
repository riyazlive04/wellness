import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Droplets, Activity, Scale } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface WeeklyGoalsProps {
  clientId: string;
}

export function WeeklyGoals({ clientId }: WeeklyGoalsProps) {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState({
    mealPhotos: { current: 0, target: 56, label: "Meal Photos" },
    waterGoal: { current: 0, target: 7, label: "Hydration Days" },
    exerciseDays: { current: 0, target: 7, label: "Active Days" },
    weightTracking: { current: 0, target: 7, label: "Weight Logs" },
  });

  useEffect(() => {
    fetchWeeklyGoals();
  }, [clientId]);

  const fetchWeeklyGoals = async () => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Fetch meal photos count
    const { count: mealCount } = await supabase
      .from("meal_logs")
      .select("*", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("logged_at", weekAgo.toISOString());

    // Fetch daily logs for the week
    const { data: dailyLogs } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("client_id", clientId)
      .gte("log_date", weekAgo.toISOString().split("T")[0]);

    const waterDays = (dailyLogs || []).filter((log) => (log.water_intake || 0) >= 2000).length;
    const activeDays = (dailyLogs || []).filter((log) => (log.activity_minutes || 0) > 0).length;
    const weightDays = (dailyLogs || []).filter((log) => log.weight !== null).length;

    setGoals({
      mealPhotos: { current: mealCount || 0, target: 56, label: "Meal Photos" },
      waterGoal: { current: waterDays, target: 7, label: "Hydration Days" },
      exerciseDays: { current: activeDays, target: 7, label: "Active Days" },
      weightTracking: { current: weightDays, target: 7, label: "Weight Logs" },
    });

    setLoading(false);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return "bg-primary";
    if (percentage >= 60) return "bg-wellness-mint";
    if (percentage >= 40) return "bg-accent";
    return "bg-destructive";
  };

  const getIcon = (key: string) => {
    switch (key) {
      case "mealPhotos":
        return <Camera className="w-4 h-4" />;
      case "waterGoal":
        return <Droplets className="w-4 h-4" />;
      case "exerciseDays":
        return <Activity className="w-4 h-4" />;
      case "weightTracking":
        return <Scale className="w-4 h-4" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weekly Goals</CardTitle>
          <CardDescription>Your progress this week</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle>Weekly Goals</CardTitle>
        <CardDescription>Your progress this week</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(goals).map(([key, goal]) => {
          const percentage = Math.min((goal.current / goal.target) * 100, 100);
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-muted-foreground">{getIcon(key)}</div>
                  <span className="text-sm font-medium">{goal.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">
                    {goal.current}/{goal.target}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${percentage >= 80 ? "bg-primary/10 text-primary" :
                    percentage >= 60 ? "bg-wellness-mint/20 text-wellness-mint" :
                      percentage >= 40 ? "bg-accent/20 text-accent-foreground" :
                        "bg-destructive/10 text-destructive"
                    }`}>
                    {Math.round(percentage)}%
                  </span>
                </div>
              </div>
              <Progress
                value={percentage}
                className={`h-2 ${getProgressColor(percentage)}`}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}