import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Save, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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

export default function AdminEditHealthAssessment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isViewMode, setIsViewMode] = useState(true);
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");

  const form = useForm<z.infer<typeof healthAssessmentSchema>>({
    resolver: zodResolver(healthAssessmentSchema),
    defaultValues: {
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

  useEffect(() => {
    loadAssessment();
  }, [id]);

  const loadAssessment = async () => {
    try {
      const { data, error } = await supabase
        .from('assessments')
        .select('*, clients(name, id)')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Assessment not found');

      setClientName(data.clients?.name || '');
      setClientId(data.clients?.id || '');

      if (data.form_responses) {
        form.reset(data.form_responses as any);
      }
    } catch (error: any) {
      console.error('Error loading assessment:', error);
      toast.error(error.message || 'Failed to load assessment');
    } finally {
      setIsLoading(false);
    }
  };

  const onSave = async (resend: boolean = false) => {
    const isValid = await form.trigger();
    if (!isValid) {
      toast.error('Please fix validation errors');
      return;
    }

    setIsSaving(true);
    try {
      const formData = form.getValues();

      const { error: updateError } = await supabase
        .from('assessments')
        .update({
          form_responses: formData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) throw updateError;

      if (resend) {
        const { error: sendError } = await supabase.functions.invoke('send-assessment', {
          body: {
            assessment_id: id,
            client_id: clientId,
          }
        });

        if (sendError) throw sendError;
        toast.success('Assessment saved and resent to client!');
      } else {
        toast.success('Assessment saved successfully!');
      }

      navigate(`/admin/client/${clientId}`);
    } catch (error: any) {
      console.error('Error saving assessment:', error);
      toast.error(error.message || 'Failed to save assessment');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Link to="/admin" className="hover:text-foreground">Admin</Link>
              <span>/</span>
              <Link to={`/admin/client/${clientId}`} className="hover:text-foreground">Client</Link>
              <span>/</span>
              <span className="text-foreground">Edit Health Assessment</span>
            </div>
            <h1 className="text-3xl font-bold">Edit Health Assessment</h1>
            <p className="text-muted-foreground mt-1">Client: {clientName}</p>
          </div>
          <Button variant="outline" onClick={() => navigate(`/admin/client/${clientId}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>View Mode</CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {isViewMode ? 'Read-only' : 'Editing'}
                </span>
                <Switch checked={!isViewMode} onCheckedChange={(checked) => setIsViewMode(!checked)} />
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Health Assessment</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-300px)] overflow-y-auto">
            <Form {...form}>
              <form className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="client_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl><Input {...field} disabled={isViewMode} onlyAlphabets /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="age" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age</FormLabel>
                      <FormControl><Input type="number" {...field} disabled={isViewMode} onlyNumbers /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="gender" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <FormControl><Input {...field} disabled={isViewMode} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="height_cm" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Height (cm)</FormLabel>
                      <FormControl><Input type="number" {...field} disabled={isViewMode} onlyNumbers /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="weight_kg" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weight (kg)</FormLabel>
                      <FormControl><Input type="number" {...field} disabled={isViewMode} onlyNumbers /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="stress_level_1_to_10" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stress Level (1-10)</FormLabel>
                      <FormControl><Input type="number" min="0" max="10" {...field} disabled={isViewMode} onlyNumbers /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="medical_condition" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Medical Conditions</FormLabel>
                    <FormControl><Textarea {...field} disabled={isViewMode} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="physical_activity_description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Physical Activity</FormLabel>
                      <FormControl><Input {...field} disabled={isViewMode} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sleep_hours_per_night" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sleep Hours Per Night</FormLabel>
                      <FormControl><Input {...field} disabled={isViewMode} onlyNumbers /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="water_intake_liters_per_day" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Water Intake (liters/day)</FormLabel>
                      <FormControl><Input {...field} disabled={isViewMode} onlyNumbers /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div>
                  <FormLabel className="mb-3 block">Biochemical Tests Done</FormLabel>
                  <div className="grid grid-cols-2 gap-3">
                    {['cbc_done', 'lipid_profile_done', 'blood_sugar_done', 'liver_function_test_done', 'kidney_function_test_done', 'vitamin_d_done', 'vitamin_b12_done', 'biochemical_others_done'].map((field) => (
                      <FormField key={field} control={form.control} name={field as any} render={({ field: checkField }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Checkbox checked={checkField.value} onCheckedChange={checkField.onChange} disabled={isViewMode} />
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
                    <FormControl><Textarea {...field} rows={4} disabled={isViewMode} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => navigate(`/admin/client/${clientId}`)}>
            Cancel
          </Button>
          <Button onClick={() => onSave(false)} disabled={isSaving || isViewMode}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
          <Button onClick={() => onSave(true)} disabled={isSaving || isViewMode}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Save & Resend to Client
          </Button>
        </div>
      </div>
    </div>
  );
}
