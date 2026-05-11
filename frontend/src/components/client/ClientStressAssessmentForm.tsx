import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const stressAssessmentSchema = z.object({
  pss_q1_upset_unexpectedly: z.enum(['0', '1', '2', '3', '4']),
  pss_q2_unable_to_control: z.enum(['0', '1', '2', '3', '4']),
  pss_q3_nervous_stressed: z.enum(['1', '2', '3', '4', '5']),
  pss_q4_confident_handling_problems: z.enum(['1', '2', '3', '4', '5']),
  pss_q5_things_going_your_way: z.enum(['1', '2', '3', '4', '5']),
  pss_q6_could_not_cope: z.enum(['1', '2', '3', '4', '5']),
  pss_q7_control_irritations: z.enum(['1', '2', '3', '4', '5']),
  pss_q8_on_top_of_things: z.enum(['1', '2', '3', '4', '5']),
  pss_q9_angered_outside_control: z.enum(['1', '2', '3', '4', '5']),
  pss_q10_difficulties_piling_up: z.enum(['1', '2', '3', '4', '5']),
});

interface ClientStressAssessmentFormProps {
  requestId: string;
  clientId: string;
  clientName: string;
  onComplete: () => void;
}

const questions = [
  { name: 'pss_q1_upset_unexpectedly', label: 'In the last month, how often have you been upset because of something that happened unexpectedly?', options: ['0', '1', '2', '3', '4'], labels: ['Never', 'Almost Never', 'Sometimes', 'Fairly Often', 'Very Often'] },
  { name: 'pss_q2_unable_to_control', label: 'In the last month, how often have you felt that you were unable to control the important things in your life?', options: ['0', '1', '2', '3', '4'], labels: ['Never', 'Almost Never', 'Sometimes', 'Fairly Often', 'Very Often'] },
  { name: 'pss_q3_nervous_stressed', label: 'In the last month, how often have you felt nervous and stressed?', options: ['1', '2', '3', '4', '5'], labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'] },
  { name: 'pss_q4_confident_handling_problems', label: 'In the last month, how often have you felt confident about your ability to handle your personal problems?', options: ['1', '2', '3', '4', '5'], labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'] },
  { name: 'pss_q5_things_going_your_way', label: 'In the last month, how often have you felt that things were going your way?', options: ['1', '2', '3', '4', '5'], labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'] },
  { name: 'pss_q6_could_not_cope', label: 'In the last month, how often have you found that you could not cope with all things you had to do?', options: ['1', '2', '3', '4', '5'], labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'] },
  { name: 'pss_q7_control_irritations', label: 'In the last month, how often have you been able to control irritations in your life?', options: ['1', '2', '3', '4', '5'], labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'] },
  { name: 'pss_q8_on_top_of_things', label: 'In the last month, how often have you felt that you were on top of things?', options: ['1', '2', '3', '4', '5'], labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'] },
  { name: 'pss_q9_angered_outside_control', label: 'In the last month, how often have you been angered because of things that were outside of your control?', options: ['1', '2', '3', '4', '5'], labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'] },
  { name: 'pss_q10_difficulties_piling_up', label: 'In the last month, how often have you felt difficulties were piling up so high that you could not overcome them?', options: ['1', '2', '3', '4', '5'], labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'] },
];

export function ClientStressAssessmentForm({ requestId, clientId, clientName, onComplete }: ClientStressAssessmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof stressAssessmentSchema>>({
    resolver: zodResolver(stressAssessmentSchema),
  });

  const onSubmit = async (data: z.infer<typeof stressAssessmentSchema>) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('submit-client-assessment', {
        body: {
          request_id: requestId,
          form_data: data,
          assessment_type: 'stress_assessment',
          client_id: clientId,
          client_name: clientName
        }
      });

      if (error) throw error;

      toast.success('Stress assessment submitted! Your results will be ready shortly.');
      onComplete();
    } catch (error: any) {
      console.error('Error submitting assessment:', error);
      toast.error(error.message || 'Failed to submit assessment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <DialogHeader>
        <DialogTitle>Stress Assessment (PSS-10)</DialogTitle>
        <DialogDescription>
          Please answer the following questions about your stress levels over the past month.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
          {questions.map((q, index) => (
            <FormField
              key={q.name}
              control={form.control}
              name={q.name as any}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {index + 1}. {q.label}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {q.options.map((option, idx) => (
                        <SelectItem key={option} value={option}>
                          {q.labels[idx]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Assessment
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
