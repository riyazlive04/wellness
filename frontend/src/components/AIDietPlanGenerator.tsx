import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AIDietPlanGeneratorProps {
  clientId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AIDietPlanGenerator({
  clientId,
  clientName,
  open,
  onOpenChange,
  onSuccess,
}: AIDietPlanGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasPreferences, setHasPreferences] = useState(false);
  const [isCheckingPreferences, setIsCheckingPreferences] = useState(true);
  const [generatedPlanId, setGeneratedPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      checkPreferences();
      setGeneratedPlanId(null);
    }
  }, [open, clientId]);

  const checkPreferences = async () => {
    setIsCheckingPreferences(true);
    try {
      const { data, error } = await supabase
        .from('diet_preferences')
        .select('id')
        .eq('client_id', clientId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      setHasPreferences(!!data);
    } catch (error) {
      console.error('Error checking preferences:', error);
      toast({
        title: "Error",
        description: "Failed to check diet preferences",
        variant: "destructive",
      });
    } finally {
      setIsCheckingPreferences(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedPlanId(null);
    
    try {
      // Get next week number
      const { data: existingPlans, error: plansError } = await supabase
        .from('weekly_plans')
        .select('week_number')
        .eq('client_id', clientId)
        .order('week_number', { ascending: false })
        .limit(1);

      if (plansError) throw plansError;

      const nextWeekNumber = existingPlans && existingPlans.length > 0 
        ? existingPlans[0].week_number + 1 
        : 1;

      const { data: result, error } = await supabase.functions.invoke('generate-diet-plan', {
        body: {
          client_id: clientId,
          week_number: nextWeekNumber,
        },
      });

      if (error) throw error;

      setGeneratedPlanId(result.plan_id);
      
      toast({
        title: "Diet Plan Generated",
        description: `Week ${nextWeekNumber} meal plan with 28 meal cards created successfully.`,
      });

      onSuccess?.();
    } catch (error: any) {
      console.error('Error generating diet plan:', error);
      if (error.message?.includes('429')) {
        toast({
          title: "Rate Limit Reached",
          description: "AI service is busy. Please try again in a few minutes.",
          variant: "destructive",
        });
      } else if (error.message?.includes('402')) {
        toast({
          title: "Credits Depleted",
          description: "AI credits depleted. Please contact support.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Generation Failed",
          description: error.message || "Failed to generate diet plan. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setGeneratedPlanId(null);
  };

  if (isCheckingPreferences) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate AI Diet Plan for {clientName}
          </DialogTitle>
          <DialogDescription>
            Create a personalized 7-day meal plan with AI
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!hasPreferences && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Diet preferences must be configured before generating a meal plan. 
                Please save preferences first.
              </AlertDescription>
            </Alert>
          )}

          {hasPreferences && !generatedPlanId && (
            <Card className="border-dashed">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">AI-Powered Meal Planning</h3>
                    <p className="text-sm text-muted-foreground">
                      Our AI will analyze the client's preferences, dietary restrictions, 
                      and calorie targets to create a balanced 7-day meal plan with 
                      4 meals per day (28 total meal cards).
                    </p>
                  </div>
                  <ul className="text-sm text-left space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Balanced macros (protein, carbs, fats)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Respects dietary preferences and allergies</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Meets daily calorie targets</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Variety and easy-to-prepare meals</span>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {generatedPlanId && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Diet plan generated successfully! The plan has been saved as a draft 
                and can be reviewed in the Plans tab.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isGenerating}>
              {generatedPlanId ? "Close" : "Cancel"}
            </Button>
            {!generatedPlanId && (
              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating || !hasPreferences}
              >
                {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isGenerating ? "Generating..." : "Generate Plan"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
