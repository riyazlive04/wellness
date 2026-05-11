import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles } from "lucide-react";

const actionPlanSchema = z.object({
  goals: z.string().min(10, "Please describe the client's goals in detail"),
  lifestyle: z.enum(["sedentary", "moderate", "active"], {
    required_error: "Please select a lifestyle type",
  }),
  age: z.string().min(1, "Age is required"),
  dietType: z.enum(["veg", "non_veg", "vegan"], {
    required_error: "Please select a diet type",
  }),
});

type ActionPlanFormData = z.infer<typeof actionPlanSchema>;

interface ActionPlanGeneratorProps {
  clientId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ActionPlanGenerator({
  clientId,
  clientName,
  open,
  onOpenChange,
  onSuccess,
}: ActionPlanGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

  const form = useForm<ActionPlanFormData>({
    resolver: zodResolver(actionPlanSchema),
    defaultValues: {
      goals: "",
      lifestyle: "moderate",
      age: "",
      dietType: "veg",
    },
  });

  const onSubmit = async (data: ActionPlanFormData) => {
    setIsGenerating(true);
    setGeneratedImageUrl(null);
    
    try {
      const { data: result, error } = await supabase.functions.invoke('generate-action-plan', {
        body: {
          client_id: clientId,
          client_name: clientName,
          ...data,
        },
      });

      if (error) throw error;

      setGeneratedImageUrl(result.image_url);
      
      toast({
        title: "Action Plan Generated",
        description: "Visual action plan has been created successfully.",
      });

      onSuccess?.();
    } catch (error: any) {
      console.error('Error generating action plan:', error);
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
          description: "Failed to generate action plan. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = () => {
    setGeneratedImageUrl(null);
    form.handleSubmit(onSubmit)();
  };

  const handleClose = () => {
    onOpenChange(false);
    setGeneratedImageUrl(null);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Action Plan for {clientName}
          </DialogTitle>
          <DialogDescription>
            Create a personalized visual action plan with AI
          </DialogDescription>
        </DialogHeader>

        {!generatedImageUrl ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="goals"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Goals</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., Lose 15kg in 100 days, improve energy levels, develop consistent exercise routine"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="lifestyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lifestyle</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="sedentary">Sedentary (Desk job, minimal movement)</SelectItem>
                          <SelectItem value="moderate">Moderate (Some daily activity)</SelectItem>
                          <SelectItem value="active">Active (Regular exercise, physical work)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="e.g., 32" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="dietType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Diet Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="veg">Vegetarian</SelectItem>
                        <SelectItem value="non_veg">Non-Vegetarian</SelectItem>
                        <SelectItem value="vegan">Vegan</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleClose} disabled={isGenerating}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isGenerating}>
                  {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isGenerating ? "Generating..." : "Generate"}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <div className="space-y-4">
            <div className="border rounded-lg overflow-hidden bg-muted">
              <img
                src={generatedImageUrl}
                alt="Generated Action Plan"
                className="w-full h-auto"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleRegenerate} disabled={isGenerating}>
                {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Regenerate
              </Button>
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
