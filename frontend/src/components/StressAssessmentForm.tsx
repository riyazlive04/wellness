import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Brain } from "lucide-react";

interface StressAssessmentFormProps {
  clientId: string;
  clientName: string;
  onComplete?: () => void;
}

export const StressAssessmentForm = ({ clientId, clientName, onComplete }: StressAssessmentFormProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState({
    pss_q1_upset_unexpectedly: "",
    pss_q2_unable_to_control: "",
    pss_q3_nervous_stressed: "",
    pss_q4_confident_handling_problems: "",
    pss_q5_things_going_your_way: "",
    pss_q6_could_not_cope: "",
    pss_q7_control_irritations: "",
    pss_q8_on_top_of_things: "",
    pss_q9_angered_outside_control: "",
    pss_q10_difficulties_piling_up: "",
  });

  const handleGenerate = async () => {
    const allAnswered = Object.values(formData).every(value => value !== "");
    if (!allAnswered) {
      toast.error("Please answer all questions");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-stress-assessment', {
        body: {
          client_id: clientId,
          client_name: clientName,
          form_data: formData,
        },
      });

      if (error) throw error;

      toast.success("Stress assessment generated successfully!");
      onComplete?.();
    } catch (error) {
      console.error('Error generating stress assessment:', error);
      toast.error("Failed to generate stress assessment");
    } finally {
      setIsGenerating(false);
    }
  };

  const scaleOptions0to4 = [
    { value: "0", label: "0 - Never" },
    { value: "1", label: "1 - Almost never" },
    { value: "2", label: "2 - Sometimes" },
    { value: "3", label: "3 - Fairly often" },
    { value: "4", label: "4 - Very often" },
  ];

  const scaleOptions1to5 = [
    { value: "1", label: "1 - Never" },
    { value: "2", label: "2 - Almost never" },
    { value: "3", label: "3 - Sometimes" },
    { value: "4", label: "4 - Fairly often" },
    { value: "5", label: "5 - Very often" },
  ];

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Perceived Stress Scale (PSS-10)</h3>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="q1">In the last month, how often have you been upset because of something that happened unexpectedly? *</Label>
          <Select value={formData.pss_q1_upset_unexpectedly} onValueChange={(value) => setFormData({ ...formData, pss_q1_upset_unexpectedly: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {scaleOptions0to4.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="q2">In the last month, how often have you felt that you were unable to control the important things in your life? *</Label>
          <Select value={formData.pss_q2_unable_to_control} onValueChange={(value) => setFormData({ ...formData, pss_q2_unable_to_control: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {scaleOptions0to4.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="q3">In the last month, how often have you felt nervous and stressed? *</Label>
          <Select value={formData.pss_q3_nervous_stressed} onValueChange={(value) => setFormData({ ...formData, pss_q3_nervous_stressed: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {scaleOptions1to5.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="q4">In the last month, how often have you felt confident about your ability to handle your personal problems? *</Label>
          <Select value={formData.pss_q4_confident_handling_problems} onValueChange={(value) => setFormData({ ...formData, pss_q4_confident_handling_problems: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {scaleOptions1to5.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="q5">In the last month, how often have you felt that things were going your way? *</Label>
          <Select value={formData.pss_q5_things_going_your_way} onValueChange={(value) => setFormData({ ...formData, pss_q5_things_going_your_way: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {scaleOptions1to5.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="q6">In the last month, how often have you found that you could not cope with all things you had to do? *</Label>
          <Select value={formData.pss_q6_could_not_cope} onValueChange={(value) => setFormData({ ...formData, pss_q6_could_not_cope: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {scaleOptions1to5.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="q7">In the last month, how often have you been able to control irritations in your life? *</Label>
          <Select value={formData.pss_q7_control_irritations} onValueChange={(value) => setFormData({ ...formData, pss_q7_control_irritations: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {scaleOptions1to5.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="q8">In the last month, how often have you felt that you were on top of things? *</Label>
          <Select value={formData.pss_q8_on_top_of_things} onValueChange={(value) => setFormData({ ...formData, pss_q8_on_top_of_things: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {scaleOptions1to5.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="q9">In the last month, how often have you been angered because of things that were outside of your control? *</Label>
          <Select value={formData.pss_q9_angered_outside_control} onValueChange={(value) => setFormData({ ...formData, pss_q9_angered_outside_control: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {scaleOptions1to5.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="q10">In the last month, how often have you felt difficulties were piling up so high that you could not overcome them? *</Label>
          <Select value={formData.pss_q10_difficulties_piling_up} onValueChange={(value) => setFormData({ ...formData, pss_q10_difficulties_piling_up: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {scaleOptions1to5.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating Assessment...
          </>
        ) : (
          <>
            <Brain className="mr-2 h-4 w-4" />
            Generate Stress Assessment
          </>
        )}
      </Button>
    </Card>
  );
};