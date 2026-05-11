import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, Droplets, Flame } from "lucide-react";
import { toast } from "sonner";

interface ProgressChartsProps {
  clientId: string;
  daysToShow?: number;
}

interface DailyData {
  date: string;
  weight: number | null;
  water_intake: number | null;
  activity_minutes: number | null;
}

interface MealLogData {
  date: string;
  total_kcal: number;
}

export function ProgressCharts({ clientId, daysToShow = 30 }: ProgressChartsProps) {
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [mealData, setMealData] = useState<MealLogData[]>([]);

  useEffect(() => {
    fetchData();
  }, [clientId, daysToShow]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch daily logs
      const { data: logs, error: logsError } = await supabase
        .from("daily_logs")
        .select("log_date, weight, water_intake, activity_minutes")
        .eq("client_id", clientId)
        .order("log_date", { ascending: true })
        .limit(daysToShow);

      if (logsError) throw logsError;

      setDailyData(
        logs.map((log) => ({
          date: new Date(log.log_date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          weight: log.weight,
          water_intake: log.water_intake,
          activity_minutes: log.activity_minutes,
        }))
      );

      // Fetch meal logs for calorie tracking
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - daysToShow);

      const { data: meals, error: mealsError } = await supabase
        .from("meal_logs")
        .select("logged_at, kcal")
        .eq("client_id", clientId)
        .gte("logged_at", thirtyDaysAgo.toISOString())
        .not("kcal", "is", null);

      if (mealsError) throw mealsError;

      // Group by date and sum kcal
      const caloriesByDate = meals.reduce((acc: Record<string, number>, meal) => {
        const date = new Date(meal.logged_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        acc[date] = (acc[date] || 0) + (meal.kcal || 0);
        return acc;
      }, {});

      setMealData(
        Object.entries(caloriesByDate).map(([date, total_kcal]) => ({
          date,
          total_kcal,
        }))
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to load chart data");
    } finally {
      setLoading(false);
    }
  };

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

  const hasWeightData = dailyData.some((d) => d.weight !== null);
  const hasWaterData = dailyData.some((d) => d.water_intake !== null);
  const hasCalorieData = mealData.length > 0;

  if (!hasWeightData && !hasWaterData && !hasCalorieData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Progress Charts</CardTitle>
          <CardDescription>Track your progress over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">No data available yet</p>
            <p className="text-sm">
              Start logging your daily metrics to see progress charts
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress Charts</CardTitle>
        <CardDescription>
          Visualize your progress over the last {daysToShow} days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="weight" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="weight" disabled={!hasWeightData}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Weight
            </TabsTrigger>
            <TabsTrigger value="water" disabled={!hasWaterData}>
              <Droplets className="h-4 w-4 mr-2" />
              Water
            </TabsTrigger>
            <TabsTrigger value="calories" disabled={!hasCalorieData}>
              <Flame className="h-4 w-4 mr-2" />
              Calories
            </TabsTrigger>
          </TabsList>

          <TabsContent value="weight" className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Weight Trend</h3>
              <p className="text-sm text-muted-foreground">
                Track your weight changes over time
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyData.filter((d) => d.weight !== null)}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  domain={["dataMin - 2", "dataMax + 2"]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Weight (kg)"
                />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="water" className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Water Intake</h3>
              <p className="text-sm text-muted-foreground">
                Monitor your daily hydration levels
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyData.filter((d) => d.water_intake !== null)}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend />
                <Bar
                  dataKey="water_intake"
                  fill="hsl(var(--primary))"
                  radius={[8, 8, 0, 0]}
                  name="Water Intake (ml)"
                />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="calories" className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Calorie Consumption</h3>
              <p className="text-sm text-muted-foreground">
                View your daily calorie intake from logged meals
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={mealData}>
                <defs>
                  <linearGradient id="colorKcal" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="total_kcal"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorKcal)"
                  name="Calories (kcal)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
