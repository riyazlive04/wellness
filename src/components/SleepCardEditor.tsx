import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Moon, Clock, Star, Sparkles, Save, Send, AlertCircle, FileText } from "lucide-react";
import { createDisplayName, validateDisplayName } from "@/lib/assessmentUtils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";


interface SleepCardEditorProps {
  cardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function SleepCardEditor({
  cardId,
  open,
  onOpenChange,
  onSave,
}: SleepCardEditorProps) {
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
          'sleep-card',
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
        description: "Failed to load sleep card",
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
        description: "Sleep card saved as draft",
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
      await handleSave();
      const { error } = await supabase.functions.invoke('send-card-to-client', {
        body: { card_id: cardId }
      });

      if (error) throw error;

      try { localStorage.setItem('sheizen-notify', JSON.stringify({ title: 'New Sleep Assessment Card', body: 'Your nutritionist has sent your Sleep Assessment card. View your results now!', ts: Date.now() })); } catch (e) {}

      toast({
        title: "Sent",
        description: "Sleep card sent to client",
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

  const sleepFrequencyLabels: Record<string, string> = {
    'not_during_past_month': 'Not during past month',
    'once_a_week': 'Once a week',
    'once_or_twice_a_week': 'Once or twice a week',
    'three_plus_times_a_week': '3+ times a week',
    'less_than_once_a_week': 'Less than once a week',
    'one_to_two_times_a_week': '1-2 times a week'
  };

  const sleepQualityLabels: Record<string, string> = {
    'very_good': 'Very Good 😊',
    'fairly_good': 'Fairly Good 🙂',
    'fairly_bad': 'Fairly Bad 😕',
    'very_bad': 'Very Bad 😫'
  };

  const problemLevelLabels: Record<string, string> = {
    'no_problem': 'No Problem ✓',
    'slight_problem': 'Slight Problem',
    'moderate_problem': 'Moderate Problem',
    'severe_problem': 'Severe Problem ⚠️'
  };

  const getQualityColor = (quality: string): string => {
    switch (quality) {
      case 'very_good': return 'bg-wellness-green/10 text-wellness-green border-wellness-green/20';
      case 'fairly_good': return 'bg-wellness-mint/10 text-wellness-mint border-wellness-mint/20';
      case 'fairly_bad': return 'bg-accent/10 text-accent-foreground border-accent/20';
      case 'very_bad': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  // Helper function to convert 12-hour time format to 24-hour format
  const to24HourTime = (value: string | undefined | null): string => {
    if (!value) return '';
    // If already in "HH:mm" format, just return it
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);

    // Handle "hh:mm AM/PM"
    const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return '';

    let [_, hRaw, m, period] = match;
    let h = parseInt(hRaw, 10);
    const isPM = period.toUpperCase() === 'PM';

    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;

    const hh = String(h).padStart(2, '0');
    return `${hh}:${m}`;
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Loading Sleep Assessment</DialogTitle>
            <DialogDescription>
              Please wait while we prepare the sleep card for review.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col items-center justify-center p-12 gap-4">
            <div className="relative">
              <Moon className="h-16 w-16 text-primary animate-pulse" />
              <Sparkles className="h-6 w-6 text-wellness-mint absolute -top-2 -right-2 animate-pulse" />
            </div>
            <p className="text-muted-foreground">Loading sleep assessment...</p>
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
              <Moon className="h-6 w-6 text-wellness-green" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl flex items-center gap-2">
                Sleep Quality Assessment
                <Badge variant="outline" className="ml-2 border-wellness-mint text-wellness-mint">
                  {cardData?.status === 'edited' ? 'Reviewed' : 'AI Generated'}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Review and personalize the assessment before sending to client
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto max-h-[90vh] md:max-h-[80vh] p-6 scrollbar-thin">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Edit Form Column */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b border-wellness-green/20">
                <Star className="h-5 w-5 text-wellness-green" />
                <h3 className="font-semibold text-lg">Edit Assessment Details</h3>
              </div>

              {/* Client Details Section */}
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

              {/* Sleep Timing Section */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-wellness-mint/5 to-transparent rounded-xl border border-wellness-mint/20 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-wellness-mint" />
                  <h4 className="font-medium text-sm">Sleep Schedule</h4>
                </div>
                <div className="grid gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="bedtime" className="text-xs text-muted-foreground flex items-center gap-1">
                      <Moon className="h-3 w-3" /> Usual Bedtime
                    </Label>
                    <Input
                      id="bedtime"
                      type="time"
                      value={to24HourTime(formData.form_responses?.bedtime_usual)}
                      onChange={(e) => updateField('form_responses.bedtime_usual', e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-wellness-mint/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="wake_time" className="text-xs text-muted-foreground flex items-center gap-1">
                      ☀️ Usual Wake Time
                    </Label>
                    <Input
                      id="wake_time"
                      type="time"
                      value={to24HourTime(formData.form_responses?.wake_time_usual)}
                      onChange={(e) => updateField('form_responses.wake_time_usual', e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-wellness-mint/20"
                    />
                  </div>
                </div>
              </div>

              {/* Sleep Quality Metrics */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-primary/5 to-transparent rounded-xl border border-primary/20 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" />
                  <h4 className="font-medium text-sm">Sleep Quality Metrics</h4>
                </div>
                <div className="grid gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="actual_sleep" className="text-xs text-muted-foreground">
                      💤 Actual Sleep Duration (hours)
                    </Label>
                    <Input
                      id="actual_sleep"
                      type="number"
                      step="0.5"
                      min="0"
                      max="24"
                      value={formData.form_responses?.actual_sleep_hours || ''}
                      onChange={(e) => updateField('form_responses.actual_sleep_hours', parseFloat(e.target.value))}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sleep_latency" className="text-xs text-muted-foreground">
                      ⏱️ Time Taken to Fall Asleep (minutes)
                    </Label>
                    <Input
                      id="sleep_latency"
                      type="number"
                      min="0"
                      value={formData.form_responses?.sleep_latency_minutes || ''}
                      onChange={(e) => updateField('form_responses.sleep_latency_minutes', parseInt(e.target.value))}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="overall_quality" className="text-xs text-muted-foreground">
                      Overall Sleep Quality Rating
                    </Label>
                    <Select
                      value={formData.form_responses?.overall_sleep_quality_rating || ''}
                      onValueChange={(value) => updateField('form_responses.overall_sleep_quality_rating', value)}
                    >
                      <SelectTrigger className={`transition-all duration-200 ${getQualityColor(formData.form_responses?.overall_sleep_quality_rating || '')}`}>
                        <SelectValue placeholder="Select quality rating" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="very_good">Very Good</SelectItem>
                        <SelectItem value="fairly_good">Fairly Good</SelectItem>
                        <SelectItem value="fairly_bad">Fairly Bad</SelectItem>
                        <SelectItem value="very_bad">Very Bad</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Sleep Challenges */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-accent/5 to-transparent rounded-xl border border-accent/20 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-accent-foreground" />
                  <h4 className="font-medium text-sm">Sleep Challenges</h4>
                </div>
                <div className="grid gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="sleep_trouble" className="text-xs text-muted-foreground">
                      🌙 How Often Do You Experience Sleep Difficulties?
                    </Label>
                    <Select
                      value={formData.form_responses?.sleep_trouble_frequency || ''}
                      onValueChange={(value) => updateField('form_responses.sleep_trouble_frequency', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_during_past_month">Not during past month</SelectItem>
                        <SelectItem value="less_than_once_a_week">Less than once a week</SelectItem>
                        <SelectItem value="once_or_twice_a_week">Once or twice a week</SelectItem>
                        <SelectItem value="three_plus_times_a_week">3+ times a week</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sleep_medicine" className="text-xs text-muted-foreground">
                      💊 Sleep Medication Usage Frequency
                    </Label>
                    <Select
                      value={formData.form_responses?.sleep_medicine_frequency || ''}
                      onValueChange={(value) => updateField('form_responses.sleep_medicine_frequency', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_during_past_month">Not during past month</SelectItem>
                        <SelectItem value="less_than_once_a_week">Less than once a week</SelectItem>
                        <SelectItem value="once_or_twice_a_week">Once or twice a week</SelectItem>
                        <SelectItem value="three_plus_times_a_week">3+ times a week</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Daytime Impact */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-secondary/5 to-transparent rounded-xl border border-secondary/20 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-secondary" />
                  <h4 className="font-medium text-sm">Daytime Impact</h4>
                </div>
                <div className="grid gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="daytime_sleepiness" className="text-xs text-muted-foreground">
                      ☀️ Daytime Sleepiness Level
                    </Label>
                    <Select
                      value={formData.form_responses?.daytime_sleepiness_frequency || ''}
                      onValueChange={(value) => updateField('form_responses.daytime_sleepiness_frequency', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_during_past_month">Not during past month</SelectItem>
                        <SelectItem value="less_than_once_a_week">Less than once a week</SelectItem>
                        <SelectItem value="once_or_twice_a_week">Once or twice a week</SelectItem>
                        <SelectItem value="three_plus_times_a_week">3+ times a week</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="enthusiasm" className="text-xs text-muted-foreground">
                      ⚡ Energy & Motivation Level
                    </Label>
                    <Select
                      value={formData.form_responses?.enthusiasm_problem_level || ''}
                      onValueChange={(value) => updateField('form_responses.enthusiasm_problem_level', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_problem">No problem at all</SelectItem>
                        <SelectItem value="slight_problem">Only a very slight problem</SelectItem>
                        <SelectItem value="somewhat_problem">Somewhat of a problem</SelectItem>
                        <SelectItem value="very_big_problem">A very big problem</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Sleep Symptoms */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-destructive/5 to-transparent rounded-xl border border-destructive/20 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <h4 className="font-medium text-sm">Observed Sleep Symptoms</h4>
                </div>

                {/* Current Symptoms Display */}
                {formData.form_responses?.sleep_symptoms_observed && Array.isArray(formData.form_responses.sleep_symptoms_observed) && formData.form_responses.sleep_symptoms_observed.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.form_responses.sleep_symptoms_observed.map((symptom: string, idx: number) => (
                      <Badge key={idx} variant="destructive" className="px-3 py-1.5 font-normal">
                        {symptom}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Editable Symptoms */}
                <div className="space-y-2 pt-2 border-t border-destructive/10">
                  <Label className="text-xs text-muted-foreground">Edit Symptoms (check/uncheck)</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      'Snoring',
                      'Sleep Apnea',
                      'Insomnia',
                      'Restless Legs',
                      'Night Sweats',
                      'Frequent Waking',
                      'Nightmares',
                      'Teeth Grinding'
                    ].map((symptom) => {
                      const symptoms = formData.form_responses?.sleep_symptoms_observed || [];
                      const isChecked = symptoms.includes(symptom);

                      return (
                        <div key={symptom} className="flex items-center space-x-2">
                          <Checkbox
                            id={`symptom-${symptom}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              const currentSymptoms = formData.form_responses?.sleep_symptoms_observed || [];
                              const newSymptoms = checked
                                ? [...currentSymptoms, symptom]
                                : currentSymptoms.filter((s: string) => s !== symptom);
                              updateField('form_responses.sleep_symptoms_observed', newSymptoms);
                            }}
                          />
                          <Label
                            htmlFor={`symptom-${symptom}`}
                            className="text-xs cursor-pointer font-normal"
                          >
                            {symptom}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              {/* AI Assessment */}
              <div className="space-y-4 p-5 bg-gradient-to-br from-wellness-green/5 to-transparent rounded-xl border border-wellness-green/20 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-wellness-green" />
                  <h4 className="font-medium text-sm">Professional Analysis & Recommendations</h4>
                </div>
                <Textarea
                  value={formData.assessment_text || ''}
                  onChange={(e) => updateField('assessment_text', e.target.value)}
                  className="min-h-[240px] transition-all duration-200 focus:ring-2 focus:ring-wellness-green/20 leading-relaxed"
                  placeholder="Provide personalized sleep analysis and recommendations based on the assessment data..."
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  💡 Tip: Use empathetic, clear language that helps the client understand their sleep patterns
                </p>
              </div>
            </div>

            {/* Preview Column */}
            <div className="space-y-6 border-l border-wellness-mint/20 pl-6">
              <div className="flex items-center gap-2 pb-2 border-b border-wellness-mint/20">
                <Sparkles className="h-5 w-5 text-wellness-mint" />
                <h3 className="font-semibold text-lg">Client Preview</h3>
              </div>

              <div className="p-6 bg-gradient-to-br from-card to-muted/20 rounded-2xl shadow-lg space-y-6 border border-border/50">
                {/* Header */}
                <div className="text-center pb-6 border-b border-border/50">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-wellness-green/10 mb-4">
                    <Moon className="h-8 w-8 text-wellness-green" />
                  </div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-wellness-green to-wellness-mint bg-clip-text text-transparent">
                    Sleep Quality Assessment
                  </h2>
                  <p className="text-lg text-foreground mt-2 font-medium">{formData.client_name}</p>
                  <p className="text-sm text-muted-foreground mt-1">Comprehensive Sleep Analysis</p>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-wellness-green/10 rounded-xl border border-wellness-green/20">
                    <div className="text-sm text-muted-foreground mb-1">Sleep Duration</div>
                    <div className="text-2xl font-bold text-wellness-green">{formData.form_responses?.actual_sleep_hours || 0}h</div>
                  </div>
                  <div className="p-4 bg-wellness-mint/10 rounded-xl border border-wellness-mint/20">
                    <div className="text-sm text-muted-foreground mb-1">Sleep Latency</div>
                    <div className="text-2xl font-bold text-wellness-mint">{formData.form_responses?.sleep_latency_minutes || 0}m</div>
                  </div>
                </div>

                {/* Sleep Schedule */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-wellness-green" />
                    Sleep Schedule
                  </h3>
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                        <Moon className="h-3 w-3" /> Bedtime
                      </span>
                      <span className="font-medium">{formData.form_responses?.bedtime_usual || 'Not specified'}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">☀️ Wake Time</span>
                      <span className="font-medium">{formData.form_responses?.wake_time_usual || 'Not specified'}</span>
                    </div>
                  </div>
                </div>

                {/* Sleep Quality Details */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <Star className="h-4 w-4 text-wellness-green" />
                    Sleep Quality Assessment
                  </h3>
                  <div className={`p-4 rounded-xl border-2 ${getQualityColor(formData.form_responses?.overall_sleep_quality_rating || '')} transition-all duration-200`}>
                    <div className="text-sm text-muted-foreground mb-1">Overall Sleep Quality</div>
                    <div className="text-xl font-bold">
                      {sleepQualityLabels[formData.form_responses?.overall_sleep_quality_rating || ''] || 'Not assessed'}
                    </div>
                  </div>

                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-muted-foreground">Sleep Difficulties</span>
                      <span className="font-medium">{sleepFrequencyLabels[formData.form_responses?.sleep_trouble_frequency || ''] || 'Not specified'}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-muted-foreground">Medication Usage</span>
                      <span className="font-medium">{sleepFrequencyLabels[formData.form_responses?.sleep_medicine_frequency || ''] || 'Not specified'}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-muted-foreground">Daytime Sleepiness</span>
                      <span className="font-medium">{sleepFrequencyLabels[formData.form_responses?.daytime_sleepiness_frequency || ''] || 'Not specified'}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-muted-foreground">Energy & Motivation</span>
                      <span className="font-medium">{problemLevelLabels[formData.form_responses?.enthusiasm_problem_level || ''] || 'Not specified'}</span>
                    </div>
                  </div>
                </div>

                {/* Symptoms */}
                {formData.form_responses?.sleep_symptoms_observed && Array.isArray(formData.form_responses.sleep_symptoms_observed) && formData.form_responses.sleep_symptoms_observed.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-base flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      Observed Sleep Symptoms
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {formData.form_responses.sleep_symptoms_observed.map((symptom: string, idx: number) => (
                        <Badge key={idx} variant="destructive" className="px-3 py-1.5">
                          {symptom}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Professional Assessment */}
                {formData.assessment_text && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-wellness-green/10 rounded-lg">
                        <Sparkles className="h-4 w-4 text-wellness-green" />
                      </div>
                      <h3 className="font-semibold text-base">Professional Analysis & Recommendations</h3>
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

                {/* Footer Note */}
                <div className="pt-4 border-t border-border/50 text-center">
                  <p className="text-xs text-muted-foreground">
                    🔒 All information is confidential and used for your personalized care
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons with Display Name */}
        <div className="space-y-3 px-6 py-4 border-t border-border/50 bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="display-name-sleep" className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-wellness-green" />
              Display File Name
            </Label>
            <Input
              id="display-name-sleep"
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