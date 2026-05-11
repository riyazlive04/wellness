import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import * as LucideIcons from "lucide-react";
import { ArrowRight } from "lucide-react";

interface AchievementProgressProps {
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    icon_name: string;
    // points removed
    target_value: number;
    category: string;
  }>;
  progress: Array<{
    achievement_id: string;
    current_value: number;
  }>;
}

export function AchievementProgress({ achievements, progress }: AchievementProgressProps) {
  // Get top 3 closest to completion (not yet earned)
  const sortedProgress = progress
    .map((p) => {
      const achievement = achievements.find((a) => a.id === p.achievement_id);
      if (!achievement) return null;

      const percentComplete = (p.current_value / achievement.target_value) * 100;
      // Filter out completed ones (100+)
      if (percentComplete >= 100) return null;

      return {
        ...p,
        achievement,
        percentComplete: Math.max(0, percentComplete),
        target_value: achievement.target_value
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && p.percentComplete > 0)
    .sort((a, b) => b.percentComplete - a.percentComplete)
    .slice(0, 3);

  if (sortedProgress.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-center text-muted-foreground text-sm">
          Log measurements and meals to start unlocking badges!
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sortedProgress.map((item) => {
        const IconComponent = (LucideIcons as any)[item.achievement.icon_name] || LucideIcons.Award;

        return (
          <Card key={item.achievement_id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 rounded-full p-2 mt-1">
                <IconComponent className="h-5 w-5 text-primary" />
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-sm">{item.achievement.title}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-1">{item.achievement.description}</p>
                  </div>
                  {/* Category instead of points */}
                  <span className="text-xs font-medium text-primary whitespace-nowrap capitalize">
                    {item.achievement.category}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {item.current_value} / {item.target_value}
                    </span>
                    <span className="font-medium">
                      {Math.round(item.percentComplete)}%
                    </span>
                  </div>
                  <Progress value={item.percentComplete} className="h-2" />
                </div>

                {item.percentComplete >= 80 && (
                  <p className="text-xs text-primary flex items-center gap-1 mt-2">
                    Almost there! <ArrowRight className="h-3 w-3" />
                  </p>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
