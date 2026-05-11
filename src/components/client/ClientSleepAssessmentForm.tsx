import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const sleepAssessmentSchema = z.object({
  bedtime_usual: z.string().min(1, "Required"),
  sleep_latency_minutes: z.coerce.number().min(0, "Must be 0 or more"),
  wake_time_usual: z.string().min(1, "Required"),
  actual_sleep_hours: z.coerce.number().min(0).max(24, "Must be between 0-24"),
  sleep_trouble_frequency: z.enum(['not_during_past_month', 'once_a_week', 'once_or_twice_a_week', 'three_plus_times_a_week']),
  sleep_medicine_frequency: z.enum(['not_during_past_month', 'less_than_once_a_week', 'one_to_two_times_a_week', 'three_plus_times_a_week']),
  daytime_sleepiness_frequency: z.enum(['not_during_past_month', 'less_than_once_a_week', 'one_to_two_times_a_week', 'three_plus_times_a_week']),
  enthusiasm_problem_level: z.enum(['no_problem', 'slight_problem', 'moderate_problem', 'big_problem']),
  overall_sleep_quality_rating: z.enum(['very_good', 'fairly_good', 'fairly_bad', 'very_bad']),
  sleep_symptoms_observed: z.array(z.string()).optional(),
});

interface ClientSleepAssessmentFormProps {
  requestId: string;
  clientId: string;
  clientName: string;
  onComplete: () => void;
}

const sleepSymptoms = [
  { id: 'loud_snoring', label: 'Loud snoring' },
  { id: 'long_pauses_breathing', label: 'Long pauses in breathing' },
  { id: 'leg_twitching', label: 'Leg twitching' },
  { id: 'disorientation', label: 'Disorientation/confusion' },
  { id: 'others', label: 'Others' },
];

export function ClientSleepAssessmentForm({ requestId, clientId, clientName, onComplete }: ClientSleepAssessmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof sleepAssessmentSchema>>({
    resolver: zodResolver(sleepAssessmentSchema),
    defaultValues: {
      sleep_symptoms_observed: [],
    },
  });

  const onSubmit = async (data: z.infer<typeof sleepAssessmentSchema>) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('submit-client-assessment', {
        body: {
          request_id: requestId,
          form_data: data,
          assessment_type: 'sleep_assessment',
          client_id: clientId,
          client_name: clientName
        }
      });

      if (error) throw error;

      toast.success('Sleep assessment submitted! Your results will be ready shortly.');
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
        <DialogTitle>Sleep Assessment (PSQI)</DialogTitle>
        <DialogDescription>
          Please answer the following questions about your sleep patterns over the past month.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="bedtime_usual" render={({ field }) => (
              <FormItem>
                <FormLabel>Usual Bedtime</FormLabel>
                <FormDescription>What time do you usually go to bed?</FormDescription>
                <FormControl><Input placeholder="e.g., 11:00 PM" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="wake_time_usual" render={({ field }) => (
              <FormItem>
                <FormLabel>Usual Wake Time</FormLabel>
                <FormDescription>What time do you usually wake up?</FormDescription>
                <FormControl><Input placeholder="e.g., 7:00 AM" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="sleep_latency_minutes" render={({ field }) => (
              <FormItem>
                <FormLabel>Time to Fall Asleep (minutes)</FormLabel>
                <FormDescription>How long does it take you to fall asleep?</FormDescription>
                <FormControl><Input type="number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="actual_sleep_hours" render={({ field }) => (
              <FormItem>
                <FormLabel>Actual Sleep Hours</FormLabel>
                <FormDescription>How many hours of actual sleep do you get?</FormDescription>
                <FormControl><Input type="number" step="0.5" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <FormField control={form.control} name="sleep_trouble_frequency" render={({ field }) => (
            <FormItem>
              <FormLabel>How often do you have trouble sleeping?</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="not_during_past_month">Not during past month</SelectItem>
                  <SelectItem value="once_a_week">Once a week</SelectItem>
                  <SelectItem value="once_or_twice_a_week">Once or twice a week</SelectItem>
                  <SelectItem value="three_plus_times_a_week">3+ times a week</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="sleep_medicine_frequency" render={({ field }) => (
            <FormItem>
              <FormLabel>How often do you take sleep medicine?</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="not_during_past_month">Not during past month</SelectItem>
                  <SelectItem value="less_than_once_a_week">&lt; once a week</SelectItem>
                  <SelectItem value="one_to_two_times_a_week">1-2 times a week</SelectItem>
                  <SelectItem value="three_plus_times_a_week">3+ times a week</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="daytime_sleepiness_frequency" render={({ field }) => (
            <FormItem>
              <FormLabel>How often do you feel sleepy during the day?</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="not_during_past_month">Not during past month</SelectItem>
                  <SelectItem value="less_than_once_a_week">&lt; once a week</SelectItem>
                  <SelectItem value="one_to_two_times_a_week">1-2 times a week</SelectItem>
                  <SelectItem value="three_plus_times_a_week">3+ times a week</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="enthusiasm_problem_level" render={({ field }) => (
            <FormItem>
              <FormLabel>Do you have problems keeping up enthusiasm?</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select problem level" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="no_problem">No problem</SelectItem>
                  <SelectItem value="slight_problem">Slight problem</SelectItem>
                  <SelectItem value="moderate_problem">Moderate problem</SelectItem>
                  <SelectItem value="big_problem">Big problem</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="overall_sleep_quality_rating" render={({ field }) => (
            <FormItem>
              <FormLabel>How would you rate your overall sleep quality?</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select quality rating" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="very_good">Very good</SelectItem>
                  <SelectItem value="fairly_good">Fairly good</SelectItem>
                  <SelectItem value="fairly_bad">Fairly bad</SelectItem>
                  <SelectItem value="very_bad">Very bad</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="sleep_symptoms_observed" render={() => (
            <FormItem>
              <FormLabel>Sleep Symptoms Observed</FormLabel>
              <FormDescription>Select any symptoms you've experienced</FormDescription>
              <div className="space-y-3">
                {sleepSymptoms.map((symptom) => (
                  <FormField
                    key={symptom.id}
                    control={form.control}
                    name="sleep_symptoms_observed"
                    render={({ field }) => {
                      return (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(symptom.id)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([...(field.value || []), symptom.id])
                                  : field.onChange(field.value?.filter((value) => value !== symptom.id))
                              }}
                            />
                          </FormControl>
                          <FormLabel className="!mt-0 cursor-pointer font-normal">
                            {symptom.label}
                          </FormLabel>
                        </FormItem>
                      )
                    }}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )} />

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
