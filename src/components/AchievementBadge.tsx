import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/formatters";

interface AchievementBadgeProps {
  achievement: {
    id: string;
    title: string;
    description: string;
    icon_name: string;
    category: string;
    target_value: number;
    // points is removed from DB, so we remove it here or make it optional/computed
  };
  earned?: boolean;
  earnedAt?: string;
  progress?: {
    current_value: number;
    // target_value is redundant if it matches achievement, but useful if passed from progress table
  };
  size?: "sm" | "md" | "lg";
}

export function AchievementBadge({
  achievement,
  earned = false,
  earnedAt,
  progress,
  size = "md",
}: AchievementBadgeProps) {
  // Helper to convert 'kebab-case' or 'snake_case' to 'PascalCase' for Lucide icons
  const getIconComponent = (name: string) => {
    if (!name) return LucideIcons.Award;

    // Convert to PascalCase: "chef-hat" -> "ChefHat"
    const pascalName = name
      .split(/[-_]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');

    // @ts-ignore - Dynamic lookup
    return LucideIcons[pascalName] || LucideIcons[name] || LucideIcons.Award;
  };

  const IconComponent = getIconComponent(achievement.icon_name);

  // Category-based coloring (Duolingo style)
  const categoryColors: Record<string, string> = {
    streak: "text-orange-500 bg-orange-100 border-orange-200",
    meal: "text-green-500 bg-green-100 border-green-200",
    water: "text-blue-500 bg-blue-100 border-blue-200",
    activity: "text-red-500 bg-red-100 border-red-200",
    assessment: "text-purple-500 bg-purple-100 border-purple-200",
    default: "text-primary bg-primary/10 border-border"
  };

  const colorClass = categoryColors[achievement.category] || categoryColors.default;

  const iconSizes = {
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16",
  };

  const cardSizes = {
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  const currentVal = progress?.current_value || 0;
  const targetVal = achievement.target_value;

  const progressPercent = earned
    ? 100
    : Math.min(100, (currentVal / targetVal) * 100);

  return (
    <Card
      className={cn(
        cardSizes[size],
        "relative transition-all duration-300 border-2",
        earned
          ? `shadow-lg ${colorClass.split(" ").pop()}` // Use border color
          : "opacity-70 border-dashed bg-muted/30",
        !earned && "grayscale-[0.9] hover:grayscale-[0.5]"
      )}
    >
      {/* Universal Unlocked Indicator */}
      {earned && (
        <div className="absolute top-2 right-2 text-primary animate-in zoom-in spin-in-12 duration-500">
          <div className="bg-background rounded-full p-0.5">
            <LucideIcons.CheckCircle2 className="h-5 w-5 fill-primary text-background" />
          </div>
        </div>
      )}

      <div className="flex flex-col items-center text-center space-y-3">
        {/* Icon */}
        <div
          className={cn(
            "rounded-full p-4 transition-transform duration-300 hover:scale-110",
            earned ? colorClass : "bg-muted text-muted-foreground",
            "shadow-sm"
          )}
        >
          <IconComponent className={iconSizes[size]} strokeWidth={1.5} />
        </div>

        {/* Name & Description */}
        <div className="space-y-1 w-full overflow-hidden">
          <h4 className="font-bold text-sm truncate" title={achievement.title}>{achievement.title}</h4>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-tight" title={achievement.description}>{achievement.description}</p>
        </div>

        {/* Category Badge (Replaces Points) */}
        {!earned && (
          <Badge variant="outline" className="text-[10px] capitalize font-normal bg-background/50">
            {achievement.category}
          </Badge>
        )}

        {/* Earned Date */}
        {earned && earnedAt && (
          <Badge variant="secondary" className="text-[10px] bg-background/80 backdrop-blur-sm">
            {formatDate(earnedAt)}
          </Badge>
        )}

        {/* Progress Bar (if not earned) */}
        {!earned && (
          <div className="w-full space-y-1 mt-2">
            <Progress value={progressPercent} className={`h-2`} />
            <p className="text-[10px] text-muted-foreground font-mono">
              {currentVal} / {targetVal}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
