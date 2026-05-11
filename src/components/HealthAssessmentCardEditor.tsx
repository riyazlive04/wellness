import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Send, FileText, Activity, Heart, Sparkles, TrendingUp } from "lucide-react";
import { createDisplayName, validateDisplayName } from "@/lib/assessmentUtils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";

interface HealthAssessmentCardEditorProps {
  cardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function HealthAssessmentCardEditor({
  cardId,
  open,
  onOpenChange,
  onSave,
}: HealthAssessmentCardEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [cardData, setCardData] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [displayName, setDisplayName] = useState('');
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";

  useEffect(() => {
    if (open && cardId) {
      fetchCardData();
    }
  }, [open, cardId]);

  const fetchCardData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pending_review_cards')
        .select('*, clients(name)')
        .eq('id', cardId)
        .single();

      if (error) throw error;

      setCardData(data);

      // Normalize data structure if it's from the old flat format
      let normalizedContent = { ...(data.generated_content as any || {}) };

      if (!normalizedContent.client_details && normalizedContent.form_responses) {
        const responses = normalizedContent.form_responses;
        const heightInMeters = (responses.height_cm || 0) / 100;
        const bmi = heightInMeters > 0 ? (responses.weight_kg / (heightInMeters * heightInMeters)).toFixed(1) : 0;

        normalizedContent.client_details = {
          name: responses.client_name || data.clients?.name || '',
          age: responses.age,
          gender: responses.gender
        };

        normalizedContent.key_findings = {
          height: responses.height_cm,
          weight: responses.weight_kg,
          bmi: parseFloat(bmi as string),
          medical_condition: responses.medical_condition
        };
      } else if (!normalizedContent.client_details) {
        // Fallback for very basic data
        normalizedContent.client_details = {
          name: data.clients?.name || '',
          age: '',
          gender: ''
        };
        normalizedContent.key_findings = {
          height: '',
          weight: '',
          bmi: '',
          medical_condition: ''
        };
      }

      setFormData(normalizedContent);

      // Generate display name if not exists
      const cardWithDisplayName = data as any;
      if (!cardWithDisplayName.display_name && data.clients) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', (await supabase.auth.getUser()).data.user?.id)
          .maybeSingle();

        const adminName = profileData?.name || 'Admin';
        const generatedName = createDisplayName(
          (data.clients as any).name,
          'health-assessment',
          adminName
        );
        setDisplayName(generatedName);
      } else {
        setDisplayName(cardWithDisplayName.display_name || '');
      }
    } catch (error) {
      console.error('Error fetching card:', error);
      toast({
        title: "Error",
        description: "Failed to load health assessment card",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pending_review_cards')
        .update({
          generated_content: formData,
          status: 'edited',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', cardId);

      if (error) throw error;

      toast({
        title: "Saved",
        description: "Health assessment card saved as draft",
      });

      onSave?.();
    } catch (error) {
      console.error('Error saving card:', error);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      // Validate display name
      const validation = validateDisplayName(displayName);
      if (!validation.valid) {
        toast({
          title: "Invalid Display Name",
          description: validation.error,
          variant: "destructive",
        });
        setSending(false);
        return;
      }

      // First save current changes
      await handleSave();

      // Then send the card
      const { error } = await supabase.functions.invoke('send-card-to-client', {
        body: {
          card_id: cardId,
          display_name: displayName
        }
      });

      if (error) throw error;

      try { localStorage.setItem('sheizen-notify', JSON.stringify({ title: 'New Health Assessment Card', body: 'Your nutritionist has sent your Health Assessment card. View your results now!', ts: Date.now() })); } catch (e) {}

      toast({
        title: "Sent",
        description: "Health assessment card sent to client",
      });

      onOpenChange(false);
      onSave?.();
    } catch (error: any) {
      console.error('Error sending card:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send card",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const updateField = (path: string, value: any) => {
    setFormData((prev: any) => {
      const newData = { ...prev };
      const keys = path.split('.');
      let current = newData;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }

      current[keys[keys.length - 1]] = value;
      return newData;
    });
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Loading Health Assessment</DialogTitle>
            <DialogDescription>
              We're preparing the health assessment card for your review.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col items-center justify-center p-12 gap-4">
            <div className="relative">
              <Heart className="h-16 w-16 text-primary animate-pulse" />
              <Activity className="h-6 w-6 text-wellness-mint absolute -top-2 -right-2 animate-pulse" />
            </div>
            <p className="text-muted-foreground">Loading health assessment...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-screen overflow-hidden flex flex-col">
        <DialogHeader className="bg-gradient-to-r from-wellness-green/10 via-wellness-mint/5 to-transparent border-b border-wellness-green/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-wellness-green/10 rounded-lg">
              <Heart className="h-6 w-6 text-wellness-green" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl flex items-center gap-2">
                Health Assessment Card
                <Badge variant="outline" className="ml-2 border-wellness-mint text-wellness-mint">
                  {cardData?.status === 'edited' ? 'Reviewed' : 'AI Generated'}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Review and personalize the health assessment before sending
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto max-h-[90vh] md:max-h-[80vh] p-6 scrollbar-thin">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Edit Form Column */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b border-wellness-green/20">
                <Activity className="h-5 w-5 text-wellness-green" />
                <h3 className="font-semibold text-lg">Edit Assessment Details</h3>
              </div>

              {/* Client Details */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-wellness-light/30 to-transparent rounded-xl border border-wellness-green/10 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-wellness-green/10 flex items-center justify-center text-wellness-green font-semibold">
                    {formData.client_details?.name?.charAt(0) || 'C'}
                  </div>
                  <h4 className="font-medium text-sm">Client Information</h4>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="client_name" className="text-xs text-muted-foreground">Full Name</Label>
                    <Input
                      id="client_name"
                      value={formData.client_details?.name || ''}
                      onChange={(e) => updateField('client_details.name', e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-wellness-green/20"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="age" className="text-xs text-muted-foreground">Age</Label>
                      <Input
                        id="age"
                        type="number"
                        value={isAdmin ? (formData.client_details?.age || '') : ''}
                        onChange={(e) => updateField('client_details.age', parseInt(e.target.value))}
                        disabled={!isAdmin}
                        className="transition-all duration-200 focus:ring-2 focus:ring-wellness-green/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="gender" className="text-xs text-muted-foreground">Gender</Label>
                      <Input
                        id="gender"
                        value={isAdmin ? (formData.client_details?.gender || '') : 'Restricted'}
                        onChange={(e) => updateField('client_details.gender', e.target.value)}
                        disabled={!isAdmin}
                        className="transition-all duration-200 focus:ring-2 focus:ring-wellness-green/20"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Findings */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-wellness-mint/5 to-transparent rounded-xl border border-wellness-mint/20 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-wellness-mint" />
                  <h4 className="font-medium text-sm">Key Health Metrics</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Height (cm)</Label>
                    <Input
                      type="number"
                      value={formData.key_findings?.height || ''}
                      onChange={(e) => updateField('key_findings.height', parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Weight (kg)</Label>
                    <Input
                      type="number"
                      value={formData.key_findings?.weight || ''}
                      onChange={(e) => updateField('key_findings.weight', parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">BMI</Label>
                    <Input
                      type="number"
                      value={formData.key_findings?.bmi || ''}
                      onChange={(e) => updateField('key_findings.bmi', parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">BMR (kcal)</Label>
                    <Input
                      type="number"
                      value={formData.key_findings?.bmr || ''}
                      onChange={(e) => updateField('key_findings.bmr', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Ideal Weight (kg)</Label>
                    <Input
                      type="number"
                      value={formData.key_findings?.ideal_weight || ''}
                      onChange={(e) => updateField('key_findings.ideal_weight', parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Target Calories (kcal)</Label>
                    <Input
                      type="number"
                      value={formData.key_findings?.calorie_intake || ''}
                      onChange={(e) => updateField('key_findings.calorie_intake', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-muted-foreground">Medical Conditions</Label>
                    <Textarea
                      value={formData.key_findings?.medical_condition || ''}
                      onChange={(e) => updateField('key_findings.medical_condition', e.target.value)}
                      className="min-h-[80px]"
                    />
                  </div>
                </div>
              </div>

              {/* AI Analysis */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-wellness-green/5 to-transparent rounded-xl border border-wellness-green/20 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-wellness-green" />
                  <h4 className="font-medium text-sm">Professional Analysis & Strategy</h4>
                </div>
                <Textarea
                  value={formData.ai_analysis || ''}
                  onChange={(e) => updateField('ai_analysis', e.target.value)}
                  className="min-h-[240px] transition-all duration-200 focus:ring-2 focus:ring-wellness-green/20 leading-relaxed"
                  placeholder="Provide personalized health analysis and strategic recommendations..."
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  💡 Tip: Connect findings to actionable lifestyle changes and long-term goals
                </p>
              </div>
            </div>

            {/* Preview Column */}
            <div className="space-y-6 border-l border-wellness-green/20 pl-6">
              <div className="flex items-center gap-2 pb-2 border-b border-wellness-green/20">
                <Sparkles className="h-5 w-5 text-wellness-green" />
                <h3 className="font-semibold text-lg">Client Preview</h3>
              </div>

              <div className="p-6 bg-gradient-to-br from-card to-muted/20 rounded-2xl shadow-lg space-y-6 border border-border/50">
                {/* Header */}
                <div className="text-center pb-6 border-b border-border/50">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-wellness-green/10 mb-4">
                    <Heart className="h-8 w-8 text-wellness-green" />
                  </div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-wellness-green to-wellness-mint bg-clip-text text-transparent">
                    Health Assessment
                  </h2>
                  <p className="text-lg text-foreground mt-2 font-medium">{formData.client_details?.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Age: {isAdmin ? formData.client_details?.age : '***'} | Gender: {isAdmin ? formData.client_details?.gender : '***'}
                  </p>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-wellness-green/10 rounded-xl border border-wellness-green/20 text-center">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Height</div>
                    <div className="text-lg font-bold text-wellness-green">{formData.key_findings?.height} cm</div>
                  </div>
                  <div className="p-3 bg-wellness-mint/10 rounded-xl border border-wellness-mint/20 text-center">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Weight</div>
                    <div className="text-lg font-bold text-wellness-mint">{formData.key_findings?.weight} kg</div>
                  </div>
                  <div className="p-3 bg-accent/10 rounded-xl border border-accent/20 text-center">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">BMI</div>
                    <div className="text-lg font-bold text-accent-foreground">{formData.key_findings?.bmi}</div>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 text-center">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">BMR</div>
                    <div className="text-sm font-bold text-primary">{formData.key_findings?.bmr} kcal</div>
                  </div>
                  <div className="p-3 bg-wellness-green/10 rounded-xl border border-wellness-green/20 text-center">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Ideal</div>
                    <div className="text-lg font-bold text-wellness-green">{formData.key_findings?.ideal_weight} kg</div>
                  </div>
                  <div className="p-3 bg-wellness-mint/10 rounded-xl border border-wellness-mint/20 text-center">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Target</div>
                    <div className="text-sm font-bold text-wellness-mint">{formData.key_findings?.calorie_intake} kcal</div>
                  </div>
                </div>

                {/* Medical Note if exists */}
                {formData.key_findings?.medical_condition && (
                  <div className="p-4 bg-muted/50 rounded-xl border border-border/50">
                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground flex items-center gap-2">
                      <Activity className="h-3 w-3" /> Medical Considerations
                    </h4>
                    <p className="text-sm italic">{formData.key_findings.medical_condition}</p>
                  </div>
                )}

                <Separator />

                {/* Professional Assessment */}
                {formData.ai_analysis && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-wellness-green/10 rounded-lg">
                        <Sparkles className="h-4 w-4 text-wellness-green" />
                      </div>
                      <h3 className="font-semibold text-base">Professional Analysis & Strategy</h3>
                    </div>
                    <div className="p-5 bg-gradient-to-br from-wellness-light/50 to-transparent rounded-xl border border-wellness-green/20">
                      <div className="prose prose-sm max-w-none">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                          {formData.ai_analysis}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer Note */}
                <div className="pt-4 border-t border-border/50 text-center">
                  <p className="text-xs text-muted-foreground">
                    🔒 This assessment is confidential and used for your personalized wellness journey
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons with Display Name */}
        <div className="space-y-3 px-6 py-4 border-t border-border/50 bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="display-name-health" className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-wellness-green" />
              Display File Name
            </Label>
            <Input
              id="display-name-health"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="filename.pdf"
              className="transition-all duration-200 focus:ring-2 focus:ring-wellness-green/20"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              This name will be shown to the client when downloading the assessment
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              {cardData?.status === 'edited' && (
                <Badge variant="outline" className="border-wellness-amber text-wellness-amber">
                  <Save className="h-3 w-3 mr-1" />
                  Draft Saved
                </Badge>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="transition-all duration-200 hover:bg-muted">
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saving}
                className="transition-all duration-200 hover:bg-wellness-mint/10 hover:border-wellness-mint hover:text-wellness-mint"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Draft
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || saving}
                className="transition-all duration-200 bg-gradient-to-r from-wellness-green to-wellness-mint hover:shadow-lg"
              >
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Review & Send to Client
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
