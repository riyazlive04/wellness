import { Card, CardContent } from "@/components/ui/card";
import { Award } from "lucide-react";

const motivations = [
  "Every small step forward is progress. You're doing amazing!",
  "Consistency beats perfection. Keep showing up for yourself!",
  "Your health journey is a marathon, not a sprint. Trust the process.",
  "Today's choices are tomorrow's results. You've got this!",
  "Progress, not perfection. Celebrate every win, no matter how small!",
];

export function MotivationCard() {
  const today = new Date().getDate();
  const motivation = motivations[today % motivations.length];

  return (
    <Card className="bg-gradient-to-br from-wellness-mint/20 to-wellness-light border-wellness-mint/30 animate-fade-in">
      <CardContent className="pt-6">
        <div className="flex gap-4 items-start">
          <div className="flex-shrink-0 w-12 h-12 bg-wellness-mint/30 rounded-full flex items-center justify-center">
            <Award className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-base md:text-lg font-medium text-foreground mb-2">
              {motivation}
            </p>
            <p className="text-sm text-muted-foreground">— Your Sheizen Team</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}