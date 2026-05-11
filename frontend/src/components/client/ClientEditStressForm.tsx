import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft, Save, Brain } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ClientEditStressForm() {
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

  const pssQuestions = [
    { key: "pss_q1_upset_unexpectedly", label: "How often have you been upset because of something that happened unexpectedly?" },
    { key: "pss_q2_unable_to_control", label: "How often have you felt that you were unable to control the important things in your life?" },
    { key: "pss_q3_nervous_stressed", label: "How often have you felt nervous and stressed?" },
    { key: "pss_q4_confident_handling_problems", label: "How often have you felt confident about your ability to handle your personal problems?" },
    { key: "pss_q5_things_going_your_way", label: "How often have you felt that things were going your way?" },
    { key: "pss_q6_could_not_cope", label: "How often have you found that you could not cope with all the things that you had to do?" },
    { key: "pss_q7_control_irritations", label: "How often have you been able to control irritations in your life?" },
    { key: "pss_q8_on_top_of_things", label: "How often have you felt that you were on top of things?" },
    { key: "pss_q9_angered_outside_control", label: "How often have you been angered because of things that were outside of your control?" },
    { key: "pss_q10_difficulties_piling_up", label: "How often have you felt difficulties were piling up so high that you could not overcome them?" },
  ];

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
          <span>Stress Assessment</span>
          <span>/</span>
          <span>Edit Form</span>
        </div>

        {/* Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Brain className="w-6 h-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-2xl">Edit Stress Assessment</CardTitle>
                <CardDescription>Update your mental wellness evaluation</CardDescription>
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
              {pssQuestions.map((question, index) => (
                <div key={question.key} className="space-y-2">
                  <Label className="text-sm font-medium">
                    {index + 1}. {question.label}
                  </Label>
                  {viewMode === "view" ? (
                    <p className="text-sm text-muted-foreground pl-4">
                      {formData[question.key] || "Not answered"}
                    </p>
                  ) : (
                    <Select
                      value={formData[question.key]?.toString() || ""}
                      onValueChange={(value) => setFormData({ ...formData, [question.key]: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Never</SelectItem>
                        <SelectItem value="1">Almost Never</SelectItem>
                        <SelectItem value="2">Sometimes</SelectItem>
                        <SelectItem value="3">Fairly Often</SelectItem>
                        <SelectItem value="4">Very Often</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
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
