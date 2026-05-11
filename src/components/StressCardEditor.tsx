import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Brain, Activity, Sparkles, Save, Send, TrendingUp, AlertTriangle, FileText } from "lucide-react";
import { createDisplayName, validateDisplayName } from "@/lib/assessmentUtils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { Progress } from "@/components/ui/progress";

interface StressCardEditorProps {
  cardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function StressCardEditor({
  cardId,
  open,
  onOpenChange,
  onSave,
}: StressCardEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [cardData, setCardData] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [displayName, setDisplayName] = useState('');

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
      setFormData(data.generated_content);

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
          'stress-card',
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
        description: "Failed to load stress card",
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
        description: "Stress card saved as draft",
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

      await handleSave();
      const { error } = await supabase.functions.invoke('send-card-to-client', {
        body: {
          card_id: cardId,
          display_name: displayName
        }
      });

      if (error) throw error;

      try { localStorage.setItem('sheizen-notify', JSON.stringify({ title: 'New Stress Assessment Card', body: 'Your nutritionist has sent your Stress Assessment card. View your results now!', ts: Date.now() })); } catch (e) {}

      toast({
        title: "Sent",
        description: "Stress card sent to client",
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

  const pssLabels0to4 = ['Never', 'Almost Never', 'Sometimes', 'Fairly Often', 'Very Often'];
  const pssLabels1to5 = ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'];

  const pssQuestions = [
    { id: 'Q1', field: 'pss_q1_upset_unexpectedly', text: 'How often have you been upset because of something that happened unexpectedly?', scale: '0-4' },
    { id: 'Q2', field: 'pss_q2_unable_to_control', text: 'How often have you felt that you were unable to control the important things in your life?', scale: '0-4' },
    { id: 'Q3', field: 'pss_q3_nervous_stressed', text: 'How often have you felt nervous and stressed?', scale: '1-5' },
    { id: 'Q4', field: 'pss_q4_confident_handling_problems', text: 'How often have you felt confident about your ability to handle your personal problems?', scale: '1-5' },
    { id: 'Q5', field: 'pss_q5_things_going_your_way', text: 'How often have you felt that things were going your way?', scale: '1-5' },
    { id: 'Q6', field: 'pss_q6_could_not_cope', text: 'How often have you found that you could not cope with all the things that you had to do?', scale: '1-5' },
    { id: 'Q7', field: 'pss_q7_control_irritations', text: 'How often have you been able to control irritations in your life?', scale: '1-5' },
    { id: 'Q8', field: 'pss_q8_on_top_of_things', text: 'How often have you felt that you were on top of things?', scale: '1-5' },
    { id: 'Q9', field: 'pss_q9_angered_outside_control', text: 'How often have you been angered because of things that were outside of your control?', scale: '1-5' },
    { id: 'Q10', field: 'pss_q10_difficulties_piling_up', text: 'How often have you felt difficulties were piling up so high that you could not overcome them?', scale: '1-5' }
  ];

  const calculatePSSScore = () => {
    const responses = formData.form_responses || {};
    let total = 0;

    total += parseInt(responses.pss_q1_upset_unexpectedly || '0');
    total += parseInt(responses.pss_q2_unable_to_control || '0');
    total += Math.max(0, parseInt(responses.pss_q3_nervous_stressed || '1') - 1);
    total += Math.max(0, parseInt(responses.pss_q4_confident_handling_problems || '1') - 1);
    total += Math.max(0, parseInt(responses.pss_q5_things_going_your_way || '1') - 1);
    total += Math.max(0, parseInt(responses.pss_q6_could_not_cope || '1') - 1);
    total += Math.max(0, parseInt(responses.pss_q7_control_irritations || '1') - 1);
    total += Math.max(0, parseInt(responses.pss_q8_on_top_of_things || '1') - 1);
    total += Math.max(0, parseInt(responses.pss_q9_angered_outside_control || '1') - 1);
    total += Math.max(0, parseInt(responses.pss_q10_difficulties_piling_up || '1') - 1);

    return total;
  };

  const interpretPSSScore = (score: number): { level: string; description: string; color: string; emoji: string } => {
    if (score <= 13) return {
      level: "Low Stress",
      description: "You're managing stress well and maintaining good coping mechanisms",
      color: "text-wellness-green bg-wellness-green/10 border-wellness-green/20",
      emoji: "😊"
    };
    if (score <= 26) return {
      level: "Moderate Stress",
      description: "Some stressors are present - let's work on coping strategies",
      color: "text-accent-foreground bg-accent/10 border-accent/20",
      emoji: "😐"
    };
    return {
      level: "High Stress",
      description: "Significant stress levels detected - professional support recommended",
      color: "text-destructive bg-destructive/10 border-destructive/20",
      emoji: "😰"
    };
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Loading Stress Assessment</DialogTitle>
            <DialogDescription>
              Please wait while we prepare the stress card for review.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col items-center justify-center p-12 gap-4">
            <div className="relative">
              <Brain className="h-16 w-16 text-primary animate-pulse" />
              <Activity className="h-6 w-6 text-wellness-mint absolute -top-2 -right-2 animate-pulse" />
            </div>
            <p className="text-muted-foreground">Loading stress assessment...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const pssScore = calculatePSSScore();
  const interpretation = interpretPSSScore(pssScore);
  const stressPercentage = (pssScore / 40) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-screen overflow-hidden flex flex-col">
        <DialogHeader className="bg-gradient-to-r from-accent/10 via-wellness-mint/5 to-transparent border-b border-accent/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg">
              <Brain className="h-6 w-6 text-accent-foreground" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl flex items-center gap-2">
                Stress Assessment (PSS-10)
                <Badge variant="outline" className="ml-2 border-wellness-mint text-wellness-mint">
                  {cardData?.status === 'edited' ? 'Reviewed' : 'AI Generated'}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Perceived Stress Scale - Review and personalize before sending
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto max-h-[90vh] md:max-h-[80vh] p-6 scrollbar-thin">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Edit Form Column */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b border-accent/20">
                <Activity className="h-5 w-5 text-accent-foreground" />
                <h3 className="font-semibold text-lg">Edit Assessment Details</h3>
              </div>

              {/* Client Details */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-wellness-light/30 to-transparent rounded-xl border border-wellness-green/10 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-wellness-green/10 flex items-center justify-center text-wellness-green font-semibold">
                    {formData.client_name?.charAt(0) || 'C'}
                  </div>
                  <h4 className="font-medium text-sm">Client Information</h4>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="client_name" className="text-xs text-muted-foreground">Full Name</Label>
                  <Input
                    id="client_name"
                    value={formData.client_name || ''}
                    onChange={(e) => updateField('client_name', e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-wellness-green/20"
                  />
                </div>
              </div>

              {/* PSS Score Display */}
              <div className={`p-6 rounded-xl border-2 ${interpretation.color} transition-all duration-300 hover:shadow-lg`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide opacity-70 mb-1">Total PSS-10 Score</p>
                    <p className="text-4xl font-bold flex items-center gap-2">
                      {pssScore} <span className="text-2xl opacity-50">/ 40</span>
                    </p>
                  </div>
                  <div className="text-3xl">{interpretation.emoji}</div>
                </div>
                <Progress value={stressPercentage} className="h-2 mb-3" />
                <div>
                  <p className="font-semibold text-lg mb-1">{interpretation.level}</p>
                  <p className="text-sm opacity-80">{interpretation.description}</p>
                </div>
              </div>

              {/* PSS-10 Questions */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-accent/5 to-transparent rounded-xl border border-accent/20 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-accent-foreground" />
                  <h4 className="font-medium text-sm">Perceived Stress Scale (PSS-10)</h4>
                </div>
                <div className="space-y-3">
                  {pssQuestions.map((q, index) => {
                    const score = formData.form_responses?.[q.field];
                    const scoreValue = score !== undefined ? score : (q.scale === '0-4' ? 0 : 1);
                    const maxScore = q.scale === '0-4' ? 4 : 5;
                    const percentage = ((scoreValue - (q.scale === '1-5' ? 1 : 0)) / (maxScore - (q.scale === '1-5' ? 1 : 0))) * 100;
                    const labels = q.scale === '0-4' ? pssLabels0to4 : pssLabels1to5;
                    const label = q.scale === '0-4' ? labels[scoreValue] : labels[scoreValue - 1];

                    return (
                      <div key={q.id} className="p-4 bg-background rounded-lg border border-border/50 transition-all duration-200 hover:border-accent/50 hover:shadow-sm">
                        <div className="flex items-start gap-3 mb-3">
                          <Badge variant="outline" className="shrink-0">{q.id}</Badge>
                          <p className="text-sm leading-relaxed">{q.text}</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <Progress value={percentage} className="flex-1 h-1.5" />
                            <Badge className={`shrink-0 ${percentage > 66 ? 'bg-destructive' : percentage > 33 ? 'bg-accent-foreground' : 'bg-wellness-green'}`}>
                              {label || 'Not answered'}
                            </Badge>
                          </div>
                          <Select
                            value={scoreValue?.toString() || ''}
                            onValueChange={(value) => updateField(`form_responses.${q.field}`, parseInt(value))}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select response" />
                            </SelectTrigger>
                            <SelectContent>
                              {labels.map((label, idx) => {
                                const value = q.scale === '0-4' ? idx : idx + 1;
                                return (
                                  <SelectItem key={value} value={value.toString()}>
                                    {label}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator className="my-4" />

              {/* AI Assessment */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-wellness-green/5 to-transparent rounded-xl border border-wellness-green/20 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-wellness-green" />
                  <h4 className="font-medium text-sm">Professional Analysis & Coping Strategies</h4>
                </div>
                <Textarea
                  value={formData.ai_analysis || ''}
                  onChange={(e) => updateField('ai_analysis', e.target.value)}
                  className="min-h-[240px] transition-all duration-200 focus:ring-2 focus:ring-wellness-green/20 leading-relaxed"
                  placeholder="Provide personalized stress analysis, coping strategies, and recommendations..."
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  💡 Tip: Include actionable stress-management techniques and encourage seeking support when needed
                </p>
              </div>
            </div>

            {/* Preview Column */}
            <div className="space-y-6 border-l border-accent/20 pl-6">
              <div className="flex items-center gap-2 pb-2 border-b border-accent/20">
                <Sparkles className="h-5 w-5 text-wellness-mint" />
                <h3 className="font-semibold text-lg">Client Preview</h3>
              </div>

              <div className="p-6 bg-gradient-to-br from-card to-muted/20 rounded-2xl shadow-lg space-y-6 border border-border/50">
                {/* Header */}
                <div className="text-center pb-6 border-b border-border/50">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 mb-4">
                    <Brain className="h-8 w-8 text-accent-foreground" />
                  </div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-accent-foreground to-wellness-green bg-clip-text text-transparent">
                    Stress Assessment
                  </h2>
                  <p className="text-lg text-foreground mt-2 font-medium">{formData.client_name}</p>
                  <p className="text-sm text-muted-foreground mt-1">Perceived Stress Scale (PSS-10)</p>
                </div>

                {/* Score Card */}
                <div className={`p-6 rounded-xl border-2 ${interpretation.color} transition-all duration-300`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide opacity-70 mb-1">Your Stress Score</p>
                      <p className="text-5xl font-bold flex items-center gap-2">
                        {pssScore} <span className="text-3xl opacity-50">/ 40</span>
                      </p>
                    </div>
                    <div className="text-5xl">{interpretation.emoji}</div>
                  </div>
                  <div className="space-y-3">
                    <Progress value={stressPercentage} className="h-3" />
                    <div>
                      <p className="font-bold text-xl mb-2">{interpretation.level}</p>
                      <p className="text-sm leading-relaxed">{interpretation.description}</p>
                    </div>
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 bg-wellness-green/10 rounded-xl text-center border border-wellness-green/20">
                    <div className="text-sm text-muted-foreground mb-1">Low</div>
                    <div className="text-lg font-bold text-wellness-green">0-13</div>
                  </div>
                  <div className="p-4 bg-accent/10 rounded-xl text-center border border-accent/20">
                    <div className="text-sm text-muted-foreground mb-1">Moderate</div>
                    <div className="text-lg font-bold text-accent-foreground">14-26</div>
                  </div>
                  <div className="p-4 bg-destructive/10 rounded-xl text-center border border-destructive/20">
                    <div className="text-sm text-muted-foreground mb-1">High</div>
                    <div className="text-lg font-bold text-destructive">27-40</div>
                  </div>
                </div>

                {/* Detailed Responses */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-wellness-green" />
                    Your Stress Assessment Responses
                  </h3>
                  <div className="space-y-2">
                    {pssQuestions.map((q) => {
                      const value = formData.form_responses?.[q.field];
                      const score = value !== undefined ? value : 0;
                      const maxScore = q.scale === '0-4' ? 4 : 5;
                      const percentage = (score / maxScore) * 100;
                      const label = value !== undefined ?
                        (q.scale === '0-4' ? pssLabels0to4[value] : pssLabels1to5[value - 1])
                        : 'Not answered';

                      return (
                        <div key={q.id} className="p-4 bg-muted/30 rounded-lg border border-border/50">
                          <div className="flex items-start gap-2 mb-2">
                            <Badge variant="outline" className="shrink-0 text-xs">{q.id}</Badge>
                            <p className="text-sm">{q.text}</p>
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <Progress value={percentage} className="flex-1 h-1.5" />
                            <span className="text-xs font-medium text-muted-foreground min-w-[100px] text-right">
                              {label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* Professional Assessment */}
                {formData.assessment_text && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-wellness-green/10 rounded-lg">
                        <Sparkles className="h-4 w-4 text-wellness-green" />
                      </div>
                      <h3 className="font-semibold text-base">Professional Analysis & Coping Strategies</h3>
                    </div>
                    <div className="p-5 bg-gradient-to-br from-wellness-light/50 to-transparent rounded-xl border border-wellness-green/20">
                      <div className="prose prose-sm max-w-none">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                          {formData.assessment_text}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Support Note */}
                {pssScore > 26 && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-destructive mb-1">Important Notice</p>
                      <p className="text-muted-foreground leading-relaxed">
                        Your stress levels indicate you may benefit from additional support. Please don't hesitate to reach out to discuss stress management strategies.
                      </p>
                    </div>
                  </div>
                )}

                {/* Footer Note */}
                <div className="pt-4 border-t border-border/50 text-center">
                  <p className="text-xs text-muted-foreground">
                    🔒 All information is confidential and used for your personalized wellness plan
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 px-6 py-4 border-t border-border/50 bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="display-name-stress" className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent-foreground" />
              Display File Name
            </Label>
            <Input
              id="display-name-stress"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="filename.pdf"
              className="transition-all duration-200 focus:ring-2 focus:ring-accent/20"
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