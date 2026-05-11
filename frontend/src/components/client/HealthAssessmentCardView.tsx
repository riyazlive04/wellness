import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Heart, Edit, Calendar, User, Activity, Target, AlertCircle, Sparkles, TrendingUp, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "react-router-dom";

interface HealthAssessmentCardViewProps {
  data: any;
  assessmentId?: string;
  onDownloadPDF?: () => void;
  attachedFiles?: any[];
}

export function HealthAssessmentCardView({ data, assessmentId, onDownloadPDF, attachedFiles = [] }: HealthAssessmentCardViewProps) {
  const navigate = useNavigate();
  const assessment = data?.assessment || data;
  const clientName = data?.client_name || assessment?.basic_info?.name || "Client";
  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Helper to safely get nested values
  const getMetric = (path: string, defaultValue: string = "--") => {
    return path.split('.').reduce((obj, key) => obj?.[key], assessment) || defaultValue;
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Report Header */}
      <div className="bg-gradient-to-br from-wellness-green via-wellness-green/95 to-wellness-mint/90 text-white p-8 rounded-t-2xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Heart className="w-64 h-64" />
        </div>

        <div className="flex flex-col md:flex-row items-start justify-between gap-6 relative z-10">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30 shadow-inner">
              <Heart className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold mb-2 tracking-tight">Health Assessment Report</h1>
              <p className="text-white/90 text-base font-medium flex items-center gap-2">
                <Activity className="w-4 h-4" /> Comprehensive Wellness Evaluation
              </p>
            </div>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            {assessmentId && (
              <Button
                onClick={() => navigate(`/client/assessments/${assessmentId}/edit-health`)}
                variant="secondary"
                size="sm"
                className="bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm transition-all"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
            {onDownloadPDF && (
              <Button
                onClick={onDownloadPDF}
                variant="secondary"
                size="sm"
                className="bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm transition-all"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            )}
          </div>
        </div>

        {/* Report Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8 pt-6 border-t border-white/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <User className="w-4 h-4 text-white/90" />
            </div>
            <div>
              <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">Client</p>
              <p className="font-semibold text-white">{clientName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Calendar className="w-4 h-4 text-white/90" />
            </div>
            <div>
              <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">Date</p>
              <p className="font-semibold text-white">{currentDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <User className="w-4 h-4 text-white/90" />
            </div>
            <div>
              <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">Age</p>
              <p className="font-semibold text-white">{getMetric('basic_info.age')} years</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <User className="w-4 h-4 text-white/90" />
            </div>
            <div>
              <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">Gender</p>
              <p className="font-semibold text-white">{getMetric('basic_info.gender')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Report Body */}
      <Card className="rounded-t-none shadow-xl border-t-0 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-8 space-y-10">

          {/* Executive Summary / Key Metrics */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1.5 h-8 bg-wellness-green rounded-full shadow-sm"></div>
              <h2 className="text-2xl font-bold text-foreground">Executive Summary</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* BMI Card */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-wellness-green/10 to-transparent border border-wellness-green/20 hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">BMI Score</p>
                    <p className="text-3xl font-bold text-wellness-green mt-1">{getMetric('basic_info.bmi')}</p>
                  </div>
                  <Activity className="w-8 h-8 text-wellness-green opacity-80" />
                </div>
                <div className="text-sm text-muted-foreground">
                  Body Mass Index
                </div>
              </div>

              {/* Weight Card */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20 hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Current Weight</p>
                    <p className="text-3xl font-bold text-blue-600 mt-1">{getMetric('basic_info.weight')} <span className="text-lg text-muted-foreground">kg</span></p>
                  </div>
                  <Target className="w-8 h-8 text-blue-500 opacity-80" />
                </div>
                <div className="text-sm text-success font-medium">
                  Ideal: {getMetric('basic_info.ideal_weight', '--')} kg
                </div>
              </div>

              {/* BMR Card */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">BMR</p>
                    <p className="text-3xl font-bold text-amber-600 mt-1">{getMetric('basic_info.bmr', '--')} <span className="text-lg text-muted-foreground">kcal</span></p>
                  </div>
                  <Sparkles className="w-8 h-8 text-amber-500 opacity-80" />
                </div>
                <div className="text-sm text-muted-foreground">
                  Basal Metabolic Rate
                </div>
              </div>
            </div>
          </section>

          <Separator className="bg-border/60" />

          {/* Goals & Lifestyle */}
          <div className="grid md:grid-cols-2 gap-10">
            {/* Health Goals */}
            <section className="flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-8 bg-blue-500 rounded-full shadow-sm"></div>
                <h2 className="text-xl font-bold text-foreground">Health Goals</h2>
              </div>

              <div className="bg-muted/30 rounded-2xl p-6 border border-border/50 h-full">
                {assessment?.health_goals?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {assessment.health_goals.map((goal: string, idx: number) => (
                      <Badge key={idx} variant="secondary" className="px-3 py-1.5 text-sm bg-background border-border shadow-sm hover:!bg-background pointer-events-none">
                        {goal}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground italic">No specific goals recorded.</p>
                )}
              </div>
            </section>

            {/* Lifestyle Snapshot */}
            <section className="flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-8 bg-purple-500 rounded-full shadow-sm"></div>
                <h2 className="text-xl font-bold text-foreground">Lifestyle Snapshot</h2>
              </div>

              <div className="bg-muted/30 rounded-2xl p-6 border border-border/50 space-y-4 h-full">
                <div className="flex justify-between items-center border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm font-medium text-muted-foreground">Diet Pattern</span>
                  <span className="font-semibold text-right">{getMetric('lifestyle.diet')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm font-medium text-muted-foreground">Exercise</span>
                  <span className="font-semibold text-right">{getMetric('lifestyle.exercise')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm font-medium text-muted-foreground">Stress Level</span>
                  <Badge variant={
                    getMetric('lifestyle.stress_level') === 'Low' ? 'default' :
                      getMetric('lifestyle.stress_level') === 'Medium' ? 'secondary' : 'destructive'
                  } className="ml-2">
                    {getMetric('lifestyle.stress_level')}
                  </Badge>
                </div>
              </div>
            </section>
          </div>

          <Separator className="bg-border/60" />

          {/* Medical History */}
          {assessment?.medical_history && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-8 bg-rose-500 rounded-full shadow-sm"></div>
                <h2 className="text-xl font-bold text-foreground">Medical Profile</h2>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                {/* Conditions */}
                <div className="p-5 rounded-xl bg-orange-50 border border-orange-100">
                  <h4 className="font-semibold text-orange-900 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Conditions
                  </h4>
                  {assessment.medical_history.conditions?.length > 0 ? (
                    <ul className="space-y-2">
                      {assessment.medical_history.conditions.map((c: string, i: number) => (
                        <li key={i} className="text-sm text-orange-800 flex items-start gap-2">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  ) : <span className="text-sm text-orange-800/60 italic">None reported</span>}
                </div>

                {/* Medications */}
                <div className="p-5 rounded-xl bg-blue-50 border border-blue-100">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Medications
                  </h4>
                  {assessment.medical_history.medications?.length > 0 ? (
                    <ul className="space-y-2">
                      {assessment.medical_history.medications.map((m: string, i: number) => (
                        <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                          {m}
                        </li>
                      ))}
                    </ul>
                  ) : <span className="text-sm text-blue-800/60 italic">None reported</span>}
                </div>

                {/* Allergies */}
                <div className="p-5 rounded-xl bg-rose-50 border border-rose-100">
                  <h4 className="font-semibold text-rose-900 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Allergies
                  </h4>
                  {assessment.medical_history.allergies?.length > 0 ? (
                    <ul className="space-y-2">
                      {assessment.medical_history.allergies.map((a: string, i: number) => (
                        <li key={i} className="text-sm text-rose-800 flex items-start gap-2">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  ) : <span className="text-sm text-rose-800/60 italic">None reported</span>}
                </div>
              </div>
            </section>
          )}

          <Separator className="bg-border/60" />

          {/* Professional Analysis */}
          {assessment?.ai_analysis && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-8 bg-gradient-to-b from-wellness-green to-wellness-mint rounded-full shadow-sm"></div>
                <h2 className="text-2xl font-bold text-foreground">Professional Analysis & Strategy</h2>
              </div>

              <div className="bg-gradient-to-br from-wellness-green/5 via-wellness-mint/5 to-transparent rounded-2xl p-8 border-2 border-wellness-green/10 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <Sparkles className="w-32 h-32 text-wellness-green" />
                </div>

                <div className="prose prose-lg max-w-none">
                  <div className="text-foreground/90 leading-relaxed whitespace-pre-wrap bg-white/60 dark:bg-black/20 rounded-xl p-6 border border-wellness-green/10 backdrop-blur-sm">
                    {assessment.ai_analysis.replace(/#/g, '')}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Key Recommendations */}
          {assessment?.recommendations && assessment.recommendations.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-8 bg-indigo-500 rounded-full shadow-sm"></div>
                <h2 className="text-xl font-bold text-foreground">Action Plan</h2>
              </div>

              <div className="grid gap-3">
                {assessment.recommendations.map((rec: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-4 p-4 bg-indigo-50/50 border border-indigo-100 hover:bg-indigo-50 transition-colors rounded-xl">
                    <div className="mt-0.5 p-1 bg-indigo-100 text-indigo-600 rounded-full">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed font-medium">{rec}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Footer Warning */}
          <div className="bg-amber-50/80 border border-amber-200 p-5 rounded-xl flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-amber-900 mb-1">Confidential Health Record</h4>
              <p className="text-sm text-amber-800/80 leading-relaxed">
                This assessment is for wellness planning purposes only and does not constitute a medical diagnosis. Please consult your physician for any medical concerns.
              </p>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Attached Documents */}
      {attachedFiles && attachedFiles.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-8 bg-gray-500 rounded-full shadow-sm"></div>
            <h2 className="text-xl font-bold text-foreground">Attached Documents</h2>
          </div>

          <div className="grid gap-3">
            {attachedFiles.map((file: any) => (
              <a
                key={file.id}
                href={file.public_url || '#'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-4 p-4 bg-gray-50/50 border border-gray-100 hover:bg-gray-100 transition-colors rounded-xl group"
              >
                <div className="p-2 bg-white rounded-lg shadow-sm group-hover:scale-105 transition-transform">
                  <FileText className="w-6 h-6 text-gray-500" />
                </div>
                <div>
                  <p className="font-medium text-foreground group-hover:text-primary transition-colors">{file.file_name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(file.created_at).toLocaleDateString()}</p>
                </div>
                <Download className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Report Footer */}
      <div className="bg-muted p-8 rounded-b-2xl border-t border-border/50 text-center">
        <p className="text-sm text-muted-foreground font-medium">
          Prepared exclusively for {clientName}
        </p>
        <p className="text-xs text-muted-foreground/60 mt-2">
          Generated by Sheizen Wellness • {currentDate}
        </p>
      </div>
    </div>
  );
}
