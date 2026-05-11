import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";

const healthAssessmentSchema = z.object({
  client_name: z.string().min(1, "Name is required"),
  age: z.coerce.number().min(1, "Age is required"),
  gender: z.string().min(1, "Gender is required"),
  height_cm: z.coerce.number().min(1, "Height is required"),
  weight_kg: z.coerce.number().min(1, "Weight is required"),
  medical_condition: z.string().optional(),
  physical_activity_description: z.string().optional(),
  sleep_hours_per_night: z.string().optional(),
  stress_level_1_to_10: z.coerce.number().min(0).max(10).optional(),
  water_intake_liters_per_day: z.string().optional(),
  smoking_habits: z.string().optional(),
  alcohol_consumption: z.string().optional(),
  lifestyle_others: z.string().optional(),
  cbc_done: z.boolean().default(false),
  lipid_profile_done: z.boolean().default(false),
  blood_sugar_done: z.boolean().default(false),
  liver_function_test_done: z.boolean().default(false),
  kidney_function_test_done: z.boolean().default(false),
  vitamin_d_done: z.boolean().default(false),
  vitamin_b12_done: z.boolean().default(false),
  biochemical_others_done: z.boolean().default(false),
  goal_weight_loss_kg: z.coerce.number().optional(),
  goal_correct_sleep_pattern: z.string().optional(),
  goal_other: z.string().optional(),
  meal_preparation_self: z.boolean().default(false),
  meal_preparation_family: z.boolean().default(false),
  meal_preparation_outsourced: z.boolean().default(false),
  eating_outside_frequency: z.string().optional(),
  eating_habit_stress_eater: z.boolean().default(false),
  bowel_movements: z.string().optional(),
  skip_breakfast: z.boolean().default(false),
  skip_lunch: z.boolean().default(false),
  skip_dinner: z.boolean().default(false),
  skip_never: z.boolean().default(false),
  diet_pattern_vegetarian: z.boolean().default(false),
  diet_pattern_non_vegetarian: z.boolean().default(false),
  diet_pattern_vegan: z.boolean().default(false),
  diet_pattern_other: z.string().optional(),
  food_recall_details: z.string().optional(),
  finding_low_protein_intake: z.boolean().default(false),
  finding_high_refined_carbs: z.boolean().default(false),
  finding_irregular_meal_timings: z.boolean().default(false),
  finding_high_mayonnaise_intake: z.boolean().default(false),
});

interface ClientHealthAssessmentFormProps {
  requestId: string;
  clientId: string;
  clientName: string;
  onComplete: () => void;
}

export function ClientHealthAssessmentForm({ requestId, clientId, clientName, onComplete }: ClientHealthAssessmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof healthAssessmentSchema>>({
    resolver: zodResolver(healthAssessmentSchema),
    defaultValues: {
      client_name: clientName,
      cbc_done: false,
      lipid_profile_done: false,
      blood_sugar_done: false,
      liver_function_test_done: false,
      kidney_function_test_done: false,
      vitamin_d_done: false,
      vitamin_b12_done: false,
      biochemical_others_done: false,
      meal_preparation_self: false,
      meal_preparation_family: false,
      meal_preparation_outsourced: false,
      eating_habit_stress_eater: false,
      skip_breakfast: false,
      skip_lunch: false,
      skip_dinner: false,
      skip_never: false,
      diet_pattern_vegetarian: false,
      diet_pattern_non_vegetarian: false,
      diet_pattern_vegan: false,
      finding_low_protein_intake: false,
      finding_high_refined_carbs: false,
      finding_irregular_meal_timings: false,
      finding_high_mayonnaise_intake: false,
    },
  });

  const onSubmit = async (data: z.infer<typeof healthAssessmentSchema>) => {
    setIsSubmitting(true);
    try {
      const { data: responseData, error } = await supabase.functions.invoke('submit-client-assessment', {
        body: {
          request_id: requestId,
          form_data: data,
          assessment_type: 'health_assessment',
          client_id: clientId,
          client_name: clientName
        }
      });

      if (error) throw error;
      if (responseData && !responseData.success) {
        throw new Error(responseData.error || 'Failed to generate assessment');
      }

      toast.success('Health assessment submitted! Your results will be ready shortly.');
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
        <DialogTitle>Health Assessment</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="client_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="age" render={({ field }) => (
              <FormItem>
                <FormLabel>Age</FormLabel>
                <FormControl><Input type="number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="gender" render={({ field }) => (
              <FormItem>
                <FormLabel>Gender</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="height_cm" render={({ field }) => (
              <FormItem>
                <FormLabel>Height (cm)</FormLabel>
                <FormControl><Input type="number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="weight_kg" render={({ field }) => (
              <FormItem>
                <FormLabel>Weight (kg)</FormLabel>
                <FormControl><Input type="number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="stress_level_1_to_10" render={({ field }) => (
              <FormItem>
                <FormLabel>Stress Level (1-10)</FormLabel>
                <FormControl><Input type="number" min="0" max="10" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <FormField control={form.control} name="medical_condition" render={({ field }) => (
            <FormItem>
              <FormLabel>Medical Conditions</FormLabel>
              <FormControl><Textarea {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="physical_activity_description" render={({ field }) => (
              <FormItem>
                <FormLabel>Physical Activity</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="sleep_hours_per_night" render={({ field }) => (
              <FormItem>
                <FormLabel>Sleep Hours Per Night</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="water_intake_liters_per_day" render={({ field }) => (
              <FormItem>
                <FormLabel>Water Intake (liters/day)</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="smoking_habits" render={({ field }) => (
              <FormItem>
                <FormLabel>Smoking Habits</FormLabel>
                <FormControl><Input placeholder="e.g., Never, Occasionally, Daily" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="alcohol_consumption" render={({ field }) => (
              <FormItem>
                <FormLabel>Alcohol Consumption</FormLabel>
                <FormControl><Input placeholder="e.g., Never, Occasionally, Weekly" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <FormField control={form.control} name="lifestyle_others" render={({ field }) => (
            <FormItem>
              <FormLabel>Other Lifestyle Notes</FormLabel>
              <FormControl><Textarea {...field} rows={2} placeholder="Any other relevant lifestyle information..." /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <div>
            <FormLabel className="mb-3 block">Biochemical Tests Done</FormLabel>
            <div className="grid grid-cols-2 gap-3">
              {['cbc_done', 'lipid_profile_done', 'blood_sugar_done', 'liver_function_test_done', 'kidney_function_test_done', 'vitamin_d_done', 'vitamin_b12_done', 'biochemical_others_done'].map((field) => (
                <FormField key={field} control={form.control} name={field as any} render={({ field: checkField }) => (
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <Checkbox checked={checkField.value} onCheckedChange={checkField.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0 cursor-pointer">
                      {field === 'biochemical_others_done' ? 'Others' : field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </FormLabel>
                  </FormItem>
                )} />
              ))}
            </div>
          </div>

          <FormField control={form.control} name="food_recall_details" render={({ field }) => (
            <FormItem>
              <FormLabel>Food Recall (24h)</FormLabel>
              <FormControl><Textarea {...field} rows={4} /></FormControl>
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
