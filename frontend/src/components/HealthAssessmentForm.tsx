import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, FileText } from "lucide-react";

interface HealthAssessmentFormProps {
  clientId: string;
  clientName: string;
  onComplete?: () => void;
}

export function HealthAssessmentForm({ clientId, clientName, onComplete }: HealthAssessmentFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState({
    client_name: clientName,
    age: "",
    gender: "",
    height_cm: "",
    weight_kg: "",
    bmi: "",
    ideal_body_weight_kg: "",
    bmr_kcal: "",
    recommended_calorie_intake_kcal: "",
    recommended_protein_intake_g: "",
    medical_condition: "",
    physical_activity_description: "",
    sleep_hours_per_night: "",
    stress_level_1_to_10: "",
    water_intake_liters_per_day: "",
    smoking_habits: "",
    alcohol_consumption: "",
    lifestyle_others: "",
    cbc_done: false,
    lipid_profile_done: false,
    blood_sugar_done: false,
    liver_function_test_done: false,
    kidney_function_test_done: false,
    vitamin_d_done: false,
    vitamin_b12_done: false,
    biochemical_others_done: false,
    goal_weight_loss_kg: "",
    goal_correct_sleep_pattern: "",
    goal_other: "",
    meal_preparation_self: false,
    meal_preparation_family: false,
    meal_preparation_outsourced: false,
    eating_outside_frequency: "",
    eating_habit_stress_eater: false,
    bowel_movements: "",
    skip_breakfast: false,
    skip_lunch: false,
    skip_dinner: false,
    skip_never: false,
    diet_pattern_vegetarian: false,
    diet_pattern_non_vegetarian: false,
    diet_pattern_vegan: false,
    diet_pattern_other: "",
    food_recall_details: "",
    finding_low_protein_intake: false,
    finding_high_refined_carbs: false,
    finding_irregular_meal_timings: false,
    finding_high_mayonnaise_intake: false,
    client_acknowledgment_signed: false,
    client_acknowledgment_date: "",
    next_steps_notes: "",
  });

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.age || !formData.gender || !formData.height_cm || !formData.weight_kg) {
      toast.error("Please fill in all required client details");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-health-assessment', {
        body: {
          client_id: clientId,
          client_name: clientName,
          form_data: formData,
        },
      });

      if (error) throw error;

      toast.success("Health assessment generated successfully!");
      onComplete?.();
    } catch (error) {
      console.error('Error generating assessment:', error);
      toast.error("Failed to generate health assessment");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Comprehensive Health Assessment</h3>
      </div>

      <div className="space-y-6">
        {/* Client Details */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Client Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="age">Age *</Label>
              <Input id="age" type="number" value={formData.age} onChange={(e) => setFormData({ ...formData, age: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="gender">Gender *</Label>
              <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Key Findings */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Key Findings</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="height">Height (cm) *</Label>
              <Input id="height" type="number" value={formData.height_cm} onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="weight">Weight (kg) *</Label>
              <Input id="weight" type="number" value={formData.weight_kg} onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="bmi">BMI</Label>
              <Input id="bmi" type="number" value={formData.bmi} onChange={(e) => setFormData({ ...formData, bmi: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="ideal_weight">Ideal Body Weight (kg)</Label>
              <Input id="ideal_weight" type="number" value={formData.ideal_body_weight_kg} onChange={(e) => setFormData({ ...formData, ideal_body_weight_kg: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="bmr">BMR (kcal)</Label>
              <Input id="bmr" type="number" value={formData.bmr_kcal} onChange={(e) => setFormData({ ...formData, bmr_kcal: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="calorie">Recommended Calorie Intake (kcal)</Label>
              <Input id="calorie" type="number" value={formData.recommended_calorie_intake_kcal} onChange={(e) => setFormData({ ...formData, recommended_calorie_intake_kcal: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="protein">Recommended Protein Intake (g)</Label>
              <Input id="protein" value={formData.recommended_protein_intake_g} onChange={(e) => setFormData({ ...formData, recommended_protein_intake_g: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="medical">Medical Condition</Label>
              <Input id="medical" value={formData.medical_condition} onChange={(e) => setFormData({ ...formData, medical_condition: e.target.value })} className="mt-1" />
            </div>
          </div>
        </div>

        {/* Lifestyle Pattern */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Lifestyle Pattern</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="activity">Physical Activity Description</Label>
              <Input id="activity" value={formData.physical_activity_description} onChange={(e) => setFormData({ ...formData, physical_activity_description: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="sleep">Sleep Hours per Night</Label>
              <Input id="sleep" value={formData.sleep_hours_per_night} onChange={(e) => setFormData({ ...formData, sleep_hours_per_night: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="stress">Stress Level (1-10)</Label>
              <Input id="stress" type="number" min="1" max="10" value={formData.stress_level_1_to_10} onChange={(e) => setFormData({ ...formData, stress_level_1_to_10: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="water">Water Intake (Liters/Day)</Label>
              <Input id="water" value={formData.water_intake_liters_per_day} onChange={(e) => setFormData({ ...formData, water_intake_liters_per_day: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="smoking">Smoking Habits</Label>
              <Select value={formData.smoking_habits} onValueChange={(value) => setFormData({ ...formData, smoking_habits: value })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select smoking habit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="occasionally">Occasionally</SelectItem>
                  <SelectItem value="daily_half_pack">Daily (&lt; 1/2 pack)</SelectItem>
                  <SelectItem value="daily_pack">Daily (1 pack)</SelectItem>
                  <SelectItem value="daily_more">Daily (&gt; 1 pack)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="alcohol">Alcohol Consumption</Label>
              <Select value={formData.alcohol_consumption} onValueChange={(value) => setFormData({ ...formData, alcohol_consumption: value })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select alcohol consumption" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="occasionally">Occasionally</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="lifestyle_others">Others (Additional Lifestyle Notes)</Label>
            <Textarea
              id="lifestyle_others"
              rows={3}
              placeholder="Any other lifestyle factors, habits, or notes..."
              value={formData.lifestyle_others}
              onChange={(e) => setFormData({ ...formData, lifestyle_others: e.target.value })}
              className="mt-1"
            />
          </div>
        </div>

        {/* Biochemical Investigations */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Biochemical Investigations</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { key: "cbc_done", label: "CBC" },
              { key: "lipid_profile_done", label: "Lipid Profile" },
              { key: "blood_sugar_done", label: "Blood Sugar" },
              { key: "liver_function_test_done", label: "Liver Function Test" },
              { key: "kidney_function_test_done", label: "Kidney Function Test" },
              { key: "vitamin_d_done", label: "Vitamin D" },
              { key: "vitamin_b12_done", label: "Vitamin B12" },
              { key: "biochemical_others_done", label: "Others" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center space-x-2">
                <Checkbox
                  id={key}
                  checked={formData[key as keyof typeof formData] as boolean}
                  onCheckedChange={(checked) => setFormData({ ...formData, [key]: checked })}
                />
                <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>
        </div>

        {/* Health Goals */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Health Goals</h4>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="weight_goal">Goal Weight Loss (kg)</Label>
              <Input id="weight_goal" type="number" value={formData.goal_weight_loss_kg} onChange={(e) => setFormData({ ...formData, goal_weight_loss_kg: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="sleep_goal">Goal: Correct Sleep Pattern</Label>
              <Input id="sleep_goal" value={formData.goal_correct_sleep_pattern} onChange={(e) => setFormData({ ...formData, goal_correct_sleep_pattern: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="other_goal">Other Goals</Label>
              <Input id="other_goal" value={formData.goal_other} onChange={(e) => setFormData({ ...formData, goal_other: e.target.value })} className="mt-1" />
            </div>
          </div>
        </div>

        {/* Dietary Assessment */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Dietary Assessment</h4>

          <div>
            <Label className="mb-2">Meal Preparation</Label>
            <div className="flex flex-wrap gap-3">
              {[
                { key: "meal_preparation_self", label: "Self" },
                { key: "meal_preparation_family", label: "Family" },
                { key: "meal_preparation_outsourced", label: "Outsourced" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={key}
                    checked={formData[key as keyof typeof formData] as boolean}
                    onCheckedChange={(checked) => setFormData({ ...formData, [key]: checked })}
                  />
                  <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="eating_out">Eating Outside Frequency</Label>
            <Input id="eating_out" value={formData.eating_outside_frequency} onChange={(e) => setFormData({ ...formData, eating_outside_frequency: e.target.value })} className="mt-1" />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="stress_eater"
              checked={formData.eating_habit_stress_eater}
              onCheckedChange={(checked) => setFormData({ ...formData, eating_habit_stress_eater: checked as boolean })}
            />
            <Label htmlFor="stress_eater" className="font-normal cursor-pointer">Stress Eater</Label>
          </div>

          <div>
            <Label htmlFor="bowel">Bowel Movements</Label>
            <Input id="bowel" value={formData.bowel_movements} onChange={(e) => setFormData({ ...formData, bowel_movements: e.target.value })} className="mt-1" />
          </div>

          <div>
            <Label className="mb-2">Meals Skipped</Label>
            <div className="flex flex-wrap gap-3">
              {[
                { key: "skip_breakfast", label: "Breakfast" },
                { key: "skip_lunch", label: "Lunch" },
                { key: "skip_dinner", label: "Dinner" },
                { key: "skip_never", label: "Never" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={key}
                    checked={formData[key as keyof typeof formData] as boolean}
                    onCheckedChange={(checked) => setFormData({ ...formData, [key]: checked })}
                  />
                  <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2">Diet Pattern</Label>
            <div className="flex flex-wrap gap-3">
              {[
                { key: "diet_pattern_vegetarian", label: "Vegetarian" },
                { key: "diet_pattern_non_vegetarian", label: "Non-Vegetarian" },
                { key: "diet_pattern_vegan", label: "Vegan" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={key}
                    checked={formData[key as keyof typeof formData] as boolean}
                    onCheckedChange={(checked) => setFormData({ ...formData, [key]: checked })}
                  />
                  <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>
            <Input
              placeholder="Other diet pattern"
              value={formData.diet_pattern_other}
              onChange={(e) => setFormData({ ...formData, diet_pattern_other: e.target.value })}
              className="mt-2"
            />
          </div>
        </div>

        {/* Food Recall */}
        <div>
          <Label htmlFor="food_recall">Food Recall Details</Label>
          <Textarea
            id="food_recall"
            rows={4}
            placeholder="Describe typical daily meals and eating patterns..."
            value={formData.food_recall_details}
            onChange={(e) => setFormData({ ...formData, food_recall_details: e.target.value })}
            className="mt-1"
          />
        </div>

        {/* Assessment Findings */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Assessment Findings</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { key: "finding_low_protein_intake", label: "Low Protein Intake" },
              { key: "finding_high_refined_carbs", label: "High Refined Carbs" },
              { key: "finding_irregular_meal_timings", label: "Irregular Meal Timings" },
              { key: "finding_high_mayonnaise_intake", label: "High Mayonnaise Intake" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center space-x-2">
                <Checkbox
                  id={key}
                  checked={formData[key as keyof typeof formData] as boolean}
                  onCheckedChange={(checked) => setFormData({ ...formData, [key]: checked })}
                />
                <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>
        </div>

        {/* Client Acknowledgment */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Client Acknowledgment</h4>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="acknowledgment"
              checked={formData.client_acknowledgment_signed}
              onCheckedChange={(checked) => setFormData({ ...formData, client_acknowledgment_signed: checked as boolean })}
            />
            <Label htmlFor="acknowledgment" className="font-normal cursor-pointer">Client has signed acknowledgment</Label>
          </div>
          <div>
            <Label htmlFor="ack_date">Acknowledgment Date</Label>
            <Input
              id="ack_date"
              type="date"
              value={formData.client_acknowledgment_date}
              onChange={(e) => setFormData({ ...formData, client_acknowledgment_date: e.target.value })}
              className="mt-1"
            />
          </div>
        </div>

        {/* Next Steps */}
        <div>
          <Label htmlFor="next_steps">Next Steps Notes (Optional)</Label>
          <Textarea
            id="next_steps"
            rows={3}
            placeholder="Any additional notes or next steps..."
            value={formData.next_steps_notes}
            onChange={(e) => setFormData({ ...formData, next_steps_notes: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>

      <Button
        onClick={handleSubmit}
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
            <FileText className="mr-2 h-4 w-4" />
            Generate Health Assessment
          </>
        )}
      </Button>
    </Card>
  );
}