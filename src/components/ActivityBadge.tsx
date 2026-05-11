import { Droplet, Utensils, Weight, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ActivityBadgeProps {
  type: 'weight' | 'water' | 'meal' | 'activity';
  value: string | number;
  className?: string;
}

export function ActivityBadge({ type, value, className }: ActivityBadgeProps) {
  const config = {
    weight: {
      icon: Weight,
      label: 'Weight',
      color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    },
    water: {
      icon: Droplet,
      label: 'Water',
      color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
    },
    meal: {
      icon: Utensils,
      label: 'Meal',
      color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
    },
    activity: {
      icon: Activity,
      label: 'Activity',
      color: 'bg-green-500/10 text-green-700 dark:text-green-400',
    },
  };

  const { icon: Icon, color } = config[type];

  return (
    <Badge variant="outline" className={`${color} gap-1.5 ${className}`}>
      <Icon className="h-3 w-3" />
      <span className="font-medium">{value}</span>
    </Badge>
  );
}
