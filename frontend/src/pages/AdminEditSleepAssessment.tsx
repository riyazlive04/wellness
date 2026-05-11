import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Save, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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

const sleepSymptoms = [
  { id: 'loud_snoring', label: 'Loud snoring' },
  { id: 'long_pauses_breathing', label: 'Long pauses in breathing' },
  { id: 'leg_twitching', label: 'Leg twitching' },
  { id: 'disorientation', label: 'Disorientation/confusion' },
  { id: 'others', label: 'Others' },
];

export default function AdminEditSleepAssessment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isViewMode, setIsViewMode] = useState(true);
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");

  const form = useForm<z.infer<typeof sleepAssessmentSchema>>({
    resolver: zodResolver(sleepAssessmentSchema),
    defaultValues: {
      sleep_symptoms_observed: [],
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
              <span className="text-foreground">Edit Sleep Assessment</span>
            </div>
            <h1 className="text-3xl font-bold">Edit Sleep Assessment</h1>
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
            <CardTitle>Sleep Assessment (PSQI)</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-300px)] overflow-y-auto">
            <Form {...form}>
              <form className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="bedtime_usual" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Usual Bedtime</FormLabel>
                      <FormDescription>What time do you usually go to bed?</FormDescription>
                      <FormControl><Input placeholder="e.g., 11:00 PM" {...field} disabled={isViewMode} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="wake_time_usual" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Usual Wake Time</FormLabel>
                      <FormDescription>What time do you usually wake up?</FormDescription>
                      <FormControl><Input placeholder="e.g., 7:00 AM" {...field} disabled={isViewMode} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="sleep_latency_minutes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time to Fall Asleep (minutes)</FormLabel>
                      <FormDescription>How long does it take to fall asleep?</FormDescription>
                      <FormControl><Input type="number" {...field} disabled={isViewMode} onlyNumbers /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="actual_sleep_hours" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Actual Sleep Hours</FormLabel>
                      <FormDescription>Hours of actual sleep</FormDescription>
                      <FormControl><Input type="number" step="0.5" {...field} disabled={isViewMode} onlyNumbers /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="sleep_trouble_frequency" render={({ field }) => (
                  <FormItem>
                    <FormLabel>How often do you have trouble sleeping?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isViewMode}>
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
                    <Select onValueChange={field.onChange} value={field.value} disabled={isViewMode}>
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
                    <Select onValueChange={field.onChange} value={field.value} disabled={isViewMode}>
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
                    <Select onValueChange={field.onChange} value={field.value} disabled={isViewMode}>
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
                    <Select onValueChange={field.onChange} value={field.value} disabled={isViewMode}>
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
                    <FormDescription>Select any symptoms experienced</FormDescription>
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
                                    disabled={isViewMode}
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
