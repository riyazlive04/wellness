import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ChevronLeft, Save, Moon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ClientEditSleepForm() {
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
          <span>Sleep Assessment</span>
          <span>/</span>
          <span>Edit Form</span>
        </div>

        {/* Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Moon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-2xl">Edit Sleep Assessment</CardTitle>
                <CardDescription>Update your sleep health evaluation</CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>

    {/* Form with Tabs */}
    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
      <Card className="mb-6">
        <CardHeader>
          <TabsList>
            <TabsTrigger value="view">View</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
          </TabsList>
        </CardHeader>
      </Card>

      <ScrollArea className="h-[calc(100vh-300px)]">
        <Card>
          <CardContent className="pt-6 space-y-6">
            <TabsContent value="view" className="mt-0">
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Usual Bedtime</Label>
                    <p className="font-medium">{formData.bedtime_usual || "Not provided"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Usual Wake Time</Label>
                    <p className="font-medium">{formData.wake_time_usual || "Not provided"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Sleep Latency (minutes)</Label>
                    <p className="font-medium">{formData.sleep_latency_minutes || "Not provided"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Actual Sleep Hours</Label>
                    <p className="font-medium">{formData.actual_sleep_hours || "Not provided"}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="edit" className="mt-0">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Usual Bedtime</Label>
                    <Input
                      type="time"
                      value={formData.bedtime_usual || ""}
                      onChange={(e) => setFormData({ ...formData, bedtime_usual: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Usual Wake Time</Label>
                    <Input
                      type="time"
                      value={formData.wake_time_usual || ""}
                      onChange={(e) => setFormData({ ...formData, wake_time_usual: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Sleep Latency (minutes)</Label>
                    <Input
                      type="number"
                      value={formData.sleep_latency_minutes || ""}
                      onChange={(e) => setFormData({ ...formData, sleep_latency_minutes: parseInt(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Actual Sleep Hours</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={formData.actual_sleep_hours || ""}
                      onChange={(e) => setFormData({ ...formData, actual_sleep_hours: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Sleep Trouble Frequency</Label>
                    <Select
                      value={formData.sleep_trouble_frequency || ""}
                      onValueChange={(value) => setFormData({ ...formData, sleep_trouble_frequency: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never</SelectItem>
                        <SelectItem value="less_than_once_week">Less than once a week</SelectItem>
                        <SelectItem value="once_twice_week">Once or twice a week</SelectItem>
                        <SelectItem value="three_or_more_week">Three or more times a week</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Overall Sleep Quality</Label>
                    <Select
                      value={formData.overall_sleep_quality_rating || ""}
                      onValueChange={(value) => setFormData({ ...formData, overall_sleep_quality_rating: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select quality" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="very_good">Very good</SelectItem>
                        <SelectItem value="fairly_good">Fairly good</SelectItem>
                        <SelectItem value="fairly_bad">Fairly bad</SelectItem>
                        <SelectItem value="very_bad">Very bad</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>
          </CardContent>
        </Card>
      </ScrollArea>
    </Tabs>

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
