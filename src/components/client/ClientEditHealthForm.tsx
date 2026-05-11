import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ChevronLeft, Save, Heart } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export default function ClientEditHealthForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"view" | "edit">("view");
  const [assessment, setAssessment] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    fetchAssessment();
  }, [id]);

  const fetchAssessment = async () => {
    try {
      const { data, error } = await supabase
        .from("assessments")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      setAssessment(data);
      setFormData(data.form_responses || {});
    } catch (error) {
      console.error("Error fetching assessment:", error);
      toast.error("Failed to load assessment");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("assessments")
        .update({
          form_responses: formData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      toast.success("Changes saved successfully");
      navigate("/dashboard");
    } catch (error) {
      console.error("Error saving assessment:", error);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-wellness-light via-background to-wellness-light/30">
      <div className="container mx-auto p-4 md:p-8 max-w-4xl">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Dashboard
          </Button>
          <span>/</span>
          <span>Health Assessment</span>
          <span>/</span>
          <span>Edit Form</span>
        </div>

        {/* Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Heart className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-2xl">Edit Health Assessment</CardTitle>
                <CardDescription>Update your comprehensive health evaluation</CardDescription>
              </div>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
                <TabsList>
                  <TabsTrigger value="view">View</TabsTrigger>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
        </Card>

        {/* Form */}
        <ScrollArea className="h-[calc(100vh-300px)]">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Age</Label>
                    {viewMode === "view" ? (
                      <p className="text-sm mt-1">{formData.age || "Not provided"}</p>
                    ) : (
                      <Input
                        type="number"
                        value={formData.age || ""}
                        onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) })}
                      />
                    )}
                  </div>
                  <div>
                    <Label>Gender</Label>
                    {viewMode === "view" ? (
                      <p className="text-sm mt-1">{formData.gender || "Not provided"}</p>
                    ) : (
                      <Input
                        value={formData.gender || ""}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      />
                    )}
                  </div>
                  <div>
                    <Label>Height (cm)</Label>
                    {viewMode === "view" ? (
                      <p className="text-sm mt-1">{formData.height_cm || "Not provided"}</p>
                    ) : (
                      <Input
                        type="number"
                        value={formData.height_cm || ""}
                        onChange={(e) => setFormData({ ...formData, height_cm: parseFloat(e.target.value) })}
                      />
                    )}
                  </div>
                  <div>
                    <Label>Weight (kg)</Label>
                    {viewMode === "view" ? (
                      <p className="text-sm mt-1">{formData.weight_kg || "Not provided"}</p>
                    ) : (
                      <Input
                        type="number"
                        value={formData.weight_kg || ""}
                        onChange={(e) => setFormData({ ...formData, weight_kg: parseFloat(e.target.value) })}
                      />
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Medical Condition */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Medical Information</h3>
                <div>
                  <Label>Medical Condition</Label>
                  {viewMode === "view" ? (
                    <p className="text-sm mt-1">{formData.medical_condition || "None reported"}</p>
                  ) : (
                    <Textarea
                      value={formData.medical_condition || ""}
                      onChange={(e) => setFormData({ ...formData, medical_condition: e.target.value })}
                      rows={3}
                    />
                  )}
                </div>
                <div>
                  <Label>Physical Activity</Label>
                  {viewMode === "view" ? (
                    <p className="text-sm mt-1">{formData.physical_activity_description || "Not provided"}</p>
                  ) : (
                    <Textarea
                      value={formData.physical_activity_description || ""}
                      onChange={(e) => setFormData({ ...formData, physical_activity_description: e.target.value })}
                      rows={2}
                    />
                  )}
                </div>
              </div>

              <Separator />

              {/* Lifestyle */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Lifestyle</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Sleep Hours per Night</Label>
                    {viewMode === "view" ? (
                      <p className="text-sm mt-1">{formData.sleep_hours_per_night || "Not provided"}</p>
                    ) : (
                      <Input
                        value={formData.sleep_hours_per_night || ""}
                        onChange={(e) => setFormData({ ...formData, sleep_hours_per_night: e.target.value })}
                      />
                    )}
                  </div>
                  <div>
                    <Label>Stress Level (1-10)</Label>
                    {viewMode === "view" ? (
                      <p className="text-sm mt-1">{formData.stress_level_1_to_10 || "Not provided"}</p>
                    ) : (
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        value={formData.stress_level_1_to_10 || ""}
                        onChange={(e) => setFormData({ ...formData, stress_level_1_to_10: parseInt(e.target.value) })}
                      />
                    )}
                  </div>
                  <div>
                    <Label>Water Intake (liters/day)</Label>
                    {viewMode === "view" ? (
                      <p className="text-sm mt-1">{formData.water_intake_liters_per_day || "Not provided"}</p>
                    ) : (
                      <Input
                        value={formData.water_intake_liters_per_day || ""}
                        onChange={(e) => setFormData({ ...formData, water_intake_liters_per_day: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Goals */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Health Goals</h3>
                <div>
                  <Label>Weight Loss Goal (kg)</Label>
                  {viewMode === "view" ? (
                    <p className="text-sm mt-1">{formData.goal_weight_loss_kg || "Not specified"}</p>
                  ) : (
                    <Input
                      type="number"
                      value={formData.goal_weight_loss_kg || ""}
                      onChange={(e) => setFormData({ ...formData, goal_weight_loss_kg: parseFloat(e.target.value) })}
                    />
                  )}
                </div>
                <div>
                  <Label>Other Goals</Label>
                  {viewMode === "view" ? (
                    <p className="text-sm mt-1">{formData.goal_other || "None specified"}</p>
                  ) : (
                    <Textarea
                      value={formData.goal_other || ""}
                      onChange={(e) => setFormData({ ...formData, goal_other: e.target.value })}
                      rows={2}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </ScrollArea>

        {/* Actions */}
        <div className="mt-6 flex justify-between gap-4 sticky bottom-0 bg-background/95 backdrop-blur-sm p-4 rounded-lg border">
          <Button variant="outline" onClick={() => navigate("/dashboard")} disabled={saving}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || viewMode === "view"}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
