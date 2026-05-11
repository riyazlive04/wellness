import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Target, CheckCircle2, XCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface ActionPlanCardViewProps {
  data: any;
  onDownloadPDF?: () => void;
}

export function ActionPlanCardView({ data, onDownloadPDF }: ActionPlanCardViewProps) {
  const plan = data?.action_plan || data;

  return (
    <Card className="w-full">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Target className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <CardTitle className="text-2xl">Health Goal Action Plan</CardTitle>
              <p className="text-sm text-muted-foreground">Your personalized wellness roadmap</p>
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
        {/* Goals */}
        {plan?.goals && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Your Health Goals</h3>
            <div className="flex flex-wrap gap-2">
              {(Array.isArray(plan.goals) ? plan.goals : [plan.goals]).map((goal: string, idx: number) => (
                <Badge key={idx} variant="secondary" className="text-sm">
                  {goal}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Daily Habits */}
        {plan?.daily_habits && plan.daily_habits.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Daily Habits to Adopt</h3>
            <div className="space-y-2">
              {plan.daily_habits.map((habit: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 p-4 rounded-lg bg-muted">
                  <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                    <span className="text-orange-600 font-semibold">{idx + 1}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium mb-1">{habit.habit || habit.title}</h4>
                    {(habit.description || habit.details) && (
                      <p className="text-sm text-muted-foreground">{habit.description || habit.details}</p>
                    )}
                    {habit.time && (
                      <p className="text-xs text-primary mt-1">⏰ {habit.time}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Do's */}
        {plan?.dos && plan.dos.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-lg">Do's - Actions to Follow</h3>
            </div>
            <div className="space-y-2">
              {plan.dos.map((item: string, idx: number) => (
                <div key={idx} className="flex items-start gap-2 p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <span className="text-sm flex-1">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Don'ts */}
        {plan?.donts && plan.donts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <h3 className="font-semibold text-lg">Don'ts - Actions to Avoid</h3>
            </div>
            <div className="space-y-2">
              {plan.donts.map((item: string, idx: number) => (
                <div key={idx} className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20">
                  <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <span className="text-sm flex-1">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Diet Type & Lifestyle */}
        {(plan?.diet_type || plan?.lifestyle) && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              {plan.diet_type && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Recommended Diet Type</p>
                  <Badge variant="outline" className="text-sm">{plan.diet_type}</Badge>
                </div>
              )}
              {plan.lifestyle && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Lifestyle Approach</p>
                  <Badge variant="outline" className="text-sm">{plan.lifestyle}</Badge>
                </div>
              )}
            </div>
          </>
        )}

        {/* Progress Tracking */}
        {plan?.tracking_metrics && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Track Your Progress</h3>
              <div className="grid gap-2">
                {plan.tracking_metrics.map((metric: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded border">
                    <span className="text-sm">{metric}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Summary */}
        {plan?.summary && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Plan Summary</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{plan.summary}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
