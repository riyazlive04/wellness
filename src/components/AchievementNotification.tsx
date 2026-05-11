import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import * as LucideIcons from "lucide-react";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  badge_color: string;
  points: number;
}

interface AchievementNotificationProps {
  newAchievements: Achievement[];
  onDismiss: () => void;
}

export function AchievementNotification({
  newAchievements,
  onDismiss,
}: AchievementNotificationProps) {
  useEffect(() => {
    if (newAchievements.length === 0) return;

    newAchievements.forEach((achievement) => {
      const IconComponent = (LucideIcons as any)[achievement.icon] || LucideIcons.Award;
      
      toast({
        title: "🎉 Achievement Unlocked!",
        description: (
          <div className="flex items-center gap-3 mt-2">
            <div className="bg-primary/10 rounded-full p-2">
              <IconComponent className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">{achievement.name}</p>
              <p className="text-sm text-muted-foreground">{achievement.description}</p>
              <p className="text-xs text-primary font-medium mt-1">+{achievement.points} points</p>
            </div>
          </div>
        ),
        duration: 5000,
      });
    });

    // Call onDismiss after showing all toasts
    setTimeout(onDismiss, 1000);
  }, [newAchievements, onDismiss]);

  return null;
}
