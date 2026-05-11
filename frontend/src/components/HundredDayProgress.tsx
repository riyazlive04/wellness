import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Calendar, TrendingDown, Droplets, Utensils, Award, CheckCircle2, Target } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatDate } from "@/lib/formatters";

interface HundredDayProgressProps {
  clientId: string;
}

interface ProgressData {
  daysElapsed: number;
  daysRemaining: number;
  adherenceScore: number;
  weightChange: number;
  mealsLogged: number;
  followupsCompleted: number;
  followupsTotal: number;
  achievementsEarned: number;
  weightData: { day: number; weight: number }[];
  weeklyAdherence: { week: number; percentage: number }[];
}

export function HundredDayProgress({ clientId }: HundredDayProgressProps) {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [programStartDate, setProgramStartDate] = useState<Date | null>(null);

  useEffect(() => {
    fetchProgressData();
  }, [clientId]);

  const fetchProgressData = async () => {
    try {
      setLoading(true);

      // Fetch client data
      const { data: client } = await supabase
        .from("clients")
        .select("created_at, last_weight")
        .eq("id", clientId)
        .single();

      if (!client) return;

      const startDate = new Date(client.created_at);
      setProgramStartDate(startDate);

      const today = new Date();
      const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, 100 - daysElapsed);

      // Fetch daily logs for adherence calculation
      const { data: logs } = await supabase
        .from("daily_logs")
        .select("log_date, weight")
        .eq("client_id", clientId)
        .order("log_date", { ascending: true });

      const totalDays = Math.min(daysElapsed, 100);
      const daysWithLogs = logs?.length || 0;
      const adherenceScore = totalDays > 0 ? Math.round((daysWithLogs / totalDays) * 100) : 0;

      // Weight data for chart (last 30 entries)
      const weightData = logs
        ?.filter((log) => log.weight !== null)
        .slice(-30)
        .map((log, index) => ({
          day: index + 1,
          weight: log.weight as number,
        })) || [];

      const firstWeight = weightData[0]?.weight || client.last_weight || 0;
      const currentWeight = weightData[weightData.length - 1]?.weight || client.last_weight || 0;
      const weightChange = firstWeight - currentWeight;

      // Fetch meal logs count
      const { count: mealsCount } = await supabase
        .from("meal_logs")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId);

      // Fetch follow-ups
      const { data: followups } = await supabase
        .from("follow_ups")
        .select("status")
        .eq("client_id", clientId);

      const followupsCompleted = followups?.filter((f) => f.status === "completed").length || 0;
      const followupsTotal = followups?.length || 0;

      // Fetch achievements
      const { count: achievementsCount } = await supabase
        .from("user_achievements")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId);

      // Calculate weekly adherence (last 14 weeks)
      const weeklyAdherence = [];
      for (let week = 0; week < Math.min(14, Math.ceil(daysElapsed / 7)); week++) {
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() + week * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const logsInWeek = logs?.filter((log) => {
          const logDate = new Date(log.log_date);
          return logDate >= weekStart && logDate <= weekEnd;
        }).length || 0;

        weeklyAdherence.push({
          week: week + 1,
          percentage: Math.round((logsInWeek / 7) * 100),
        });
      }

      setProgress({
        daysElapsed: Math.min(daysElapsed, 100),
        daysRemaining,
        adherenceScore,
        weightChange,
        mealsLogged: mealsCount || 0,
        followupsCompleted,
        followupsTotal,
        achievementsEarned: achievementsCount || 0,
        weightData,
        weeklyAdherence,
      });
    } catch (error) {
      console.error("Error fetching progress data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="animate-pulse">
          <CardContent className="h-48" />
        </Card>
      </div>
    );
  }

  if (!progress) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No progress data available
        </CardContent>
      </Card>
    );
  }

  const milestones = [7, 14, 30, 60, 90, 100];
  const progressPercentage = (progress.daysElapsed / 100) * 100;

  return (
    <div className="space-y-6">
      {/* Progress Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            100-Day Journey Progress
          </CardTitle>
          <CardDescription>
            Started on {formatDate(programStartDate)} • Day {progress.daysElapsed} of 100
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Overall Progress</span>
              <span className="text-muted-foreground">{Math.round(progressPercentage)}%</span>
            </div>
            <Progress value={progressPercentage} className="h-3" />
          </div>

          {/* Milestone Markers */}
          <div className="flex justify-between items-center pt-2">
            {milestones.map((day) => (
              <div key={day} className="flex flex-col items-center">
                <div
                  className={`w-3 h-3 rounded-full mb-1 ${progress.daysElapsed >= day
                      ? "bg-primary"
                      : "bg-muted border-2 border-muted-foreground"
                    }`}
                />
                <span className="text-xs text-muted-foreground">Day {day}</span>
                {progress.daysElapsed >= day && (
                  <CheckCircle2 className="h-3 w-3 text-primary mt-1" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Days Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{progress.daysElapsed}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {progress.daysRemaining} days remaining
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Adherence Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{progress.adherenceScore}%</div>
            <Progress value={progress.adherenceScore} className="h-2 mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-500" />
              Weight Change
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {progress.weightChange > 0 ? "-" : "+"}
              {Math.abs(progress.weightChange).toFixed(1)} kg
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {progress.weightChange > 0 ? "Lost" : "Gained"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="h-4 w-4 text-yellow-500" />
              Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{progress.achievementsEarned}</div>
            <p className="text-xs text-muted-foreground mt-1">Badges earned</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Utensils className="h-4 w-4 text-orange-500" />
              Meals Logged
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{progress.mealsLogged}</div>
            <p className="text-xs text-muted-foreground mt-1">Total meal entries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Droplets className="h-4 w-4 text-blue-500" />
              Follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {progress.followupsCompleted}/{progress.followupsTotal}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Sessions completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Weight Trend Chart */}
      {progress.weightData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Weight Trend</CardTitle>
            <CardDescription>Last 30 recorded weights</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={progress.weightData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" label={{ value: "Days", position: "insideBottom", offset: -5 }} />
                <YAxis label={{ value: "Weight (kg)", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Weekly Adherence Heatmap */}
      {progress.weeklyAdherence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Weekly Adherence</CardTitle>
            <CardDescription>Percentage of days with logs per week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {progress.weeklyAdherence.map((week) => (
                <div key={week.week} className="text-center">
                  <div
                    className={`h-12 rounded flex items-center justify-center text-sm font-medium ${week.percentage >= 80
                        ? "bg-green-500 text-white"
                        : week.percentage >= 50
                          ? "bg-yellow-500 text-white"
                          : "bg-red-500 text-white"
                      }`}
                  >
                    {week.percentage}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">W{week.week}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
