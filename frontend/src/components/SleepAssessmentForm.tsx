import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Moon } from "lucide-react";

interface SleepAssessmentFormProps {
  clientId: string;
  clientName: string;
  onComplete?: () => void;
}

export const SleepAssessmentForm = ({ clientId, clientName, onComplete }: SleepAssessmentFormProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState({
    bedtime_usual: "",
    sleep_latency_minutes: "",
    wake_time_usual: "",
    actual_sleep_hours: "",
    sleep_trouble_frequency: "",
    sleep_medicine_frequency: "",
    daytime_sleepiness_frequency: "",
    enthusiasm_problem_level: "",
    overall_sleep_quality_rating: "",
    sleep_symptoms_observed: [] as string[],
  });

  const handleCheckboxChange = (value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      sleep_symptoms_observed: checked
        ? [...prev.sleep_symptoms_observed, value]
        : prev.sleep_symptoms_observed.filter(item => item !== value)
    }));
  };

  const handleGenerate = async () => {
    if (!formData.bedtime_usual || !formData.sleep_latency_minutes || !formData.wake_time_usual ||
      !formData.actual_sleep_hours || !formData.sleep_trouble_frequency || !formData.sleep_medicine_frequency ||
      !formData.daytime_sleepiness_frequency || !formData.enthusiasm_problem_level ||
      !formData.overall_sleep_quality_rating) {
      toast.error("Please answer all required questions");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-sleep-assessment', {
        body: {
          client_id: clientId,
          client_name: clientName,
          form_data: formData,
        },
      });

      if (error) throw error;

      toast.success("Sleep assessment generated successfully!");
      onComplete?.();
    } catch (error) {
      console.error('Error generating sleep assessment:', error);
      toast.error("Failed to generate sleep assessment");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Moon className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Sleep Quality Assessment (PSQI)</h3>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="bedtime">During the past month, what time have you usually gone to bed at night? *</Label>
          <Input
            id="bedtime"
            type="time"
            value={formData.bedtime_usual}
            onChange={(e) => setFormData({ ...formData, bedtime_usual: e.target.value })}
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="latency">During the past month, how long (in minutes) has it usually taken you to fall asleep each night? *</Label>
          <Input
            id="latency"
            type="number"
            placeholder="e.g., 15"
            value={formData.sleep_latency_minutes}
            onChange={(e) => setFormData({ ...formData, sleep_latency_minutes: e.target.value })}
            min="0"
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="waketime">During the past month, what time have you usually gotten up in the morning? *</Label>
          <Input
            id="waketime"
            type="time"
            value={formData.wake_time_usual}
            onChange={(e) => setFormData({ ...formData, wake_time_usual: e.target.value })}
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="sleephours">During the past month, how many hours of actual sleep did you get at night? *</Label>
          <Input
            id="sleephours"
            type="number"
            placeholder="e.g., 6.5"
            value={formData.actual_sleep_hours}
            onChange={(e) => setFormData({ ...formData, actual_sleep_hours: e.target.value })}
            step="0.5"
            min="0"
            max="24"
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="trouble">How often have you had trouble sleeping? *</Label>
          <Select value={formData.sleep_trouble_frequency} onValueChange={(value) => setFormData({ ...formData, sleep_trouble_frequency: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_during_past_month">Not during past month</SelectItem>
              <SelectItem value="once_a_week">Once a week</SelectItem>
              <SelectItem value="once_or_twice_a_week">Once or twice a week</SelectItem>
              <SelectItem value="three_or_more_times_a_week">3+ times a week</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="medicine">How often have you taken medicine to help you sleep? *</Label>
          <Select value={formData.sleep_medicine_frequency} onValueChange={(value) => setFormData({ ...formData, sleep_medicine_frequency: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_during_past_month">Not during past month</SelectItem>
              <SelectItem value="less_than_once_a_week">&lt; once a week</SelectItem>
              <SelectItem value="one_or_two_times_a_week">1–2 times a week</SelectItem>
              <SelectItem value="three_or_more_times_a_week">3+ times a week</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="sleepiness">How often have you had daytime sleepiness? *</Label>
          <Select value={formData.daytime_sleepiness_frequency} onValueChange={(value) => setFormData({ ...formData, daytime_sleepiness_frequency: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_during_past_month">Not during past month</SelectItem>
              <SelectItem value="less_than_once_a_week">&lt; once a week</SelectItem>
              <SelectItem value="one_or_two_times_a_week">1–2 times a week</SelectItem>
              <SelectItem value="three_or_more_times_a_week">3+ times a week</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="enthusiasm">How much of a problem has it been for you to keep up enthusiasm to get things done? *</Label>
          <Select value={formData.enthusiasm_problem_level} onValueChange={(value) => setFormData({ ...formData, enthusiasm_problem_level: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select problem level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no_problem">No problem</SelectItem>
              <SelectItem value="slight_problem">Slight problem</SelectItem>
              <SelectItem value="moderate_problem">Moderate problem</SelectItem>
              <SelectItem value="big_problem">Big problem</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="quality">How would you rate your overall sleep quality? *</Label>
          <Select value={formData.overall_sleep_quality_rating} onValueChange={(value) => setFormData({ ...formData, overall_sleep_quality_rating: value })}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select quality rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="very_good">Very good</SelectItem>
              <SelectItem value="fairly_good">Fairly good</SelectItem>
              <SelectItem value="fairly_bad">Fairly bad</SelectItem>
              <SelectItem value="very_bad">Very bad</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Sleep symptoms observed (Select all that apply)</Label>
          <div className="mt-2 space-y-2">
            {[
              { value: "loud_snoring", label: "Loud snoring" },
              { value: "long_pauses_in_breathing", label: "Long pauses in breathing" },
              { value: "leg_twitching", label: "Leg twitching" },
              { value: "disorientation_confusion", label: "Disorientation/confusion" },
              { value: "others", label: "Others" },
            ].map(({ value, label }) => (
              <div key={value} className="flex items-center space-x-2">
                <Checkbox
                  id={value}
                  checked={formData.sleep_symptoms_observed.includes(value)}
                  onCheckedChange={(checked) => handleCheckboxChange(value, checked as boolean)}
                />
                <Label htmlFor={value} className="font-normal cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>
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
            <Moon className="mr-2 h-4 w-4" />
            Generate Sleep Assessment
          </>
        )}
      </Button>
    </Card>
  );
};