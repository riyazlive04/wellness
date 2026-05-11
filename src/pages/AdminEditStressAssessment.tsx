import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Save, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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

export default function AdminEditStressAssessment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isViewMode, setIsViewMode] = useState(true);
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");

  const form = useForm<z.infer<typeof stressAssessmentSchema>>({
    resolver: zodResolver(stressAssessmentSchema),
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
              <span className="text-foreground">Edit Stress Assessment</span>
            </div>
            <h1 className="text-3xl font-bold">Edit Stress Assessment</h1>
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
            <CardTitle>Stress Assessment (PSS-10)</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-300px)] overflow-y-auto">
            <Form {...form}>
              <form className="space-y-6">
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
                        <Select onValueChange={field.onChange} value={field.value} disabled={isViewMode}>
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
