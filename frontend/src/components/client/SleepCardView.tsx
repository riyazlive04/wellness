import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Moon, Edit, Calendar, User, Clock, AlertCircle, Sparkles, TrendingUp, Zap, Star, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";

interface SleepCardViewProps {
  data: any;
  assessmentId?: string;
  onDownloadPDF?: () => void;
  attachedFiles?: any[];
}

export function SleepCardView({ data, assessmentId, onDownloadPDF, attachedFiles = [] }: SleepCardViewProps) {
  const navigate = useNavigate();
  const assessment = data?.assessment_data || data;
  const clientName = data?.client_name || "Client";
  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Safe helper
  const getVal = (path: string, def = '--') => {
    return path.split('.').reduce((obj, key) => obj?.[key], assessment) || def;
  };

  const sleepQuality = parseInt(getVal('key_findings.sleep_quality', '0'));

  const getQualityColor = (score: number) => {
    if (score >= 8) return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500' };
    if (score >= 5) return { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-500' };
    return { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200', bar: 'bg-rose-500' };
  };

  const qColor = getQualityColor(sleepQuality);

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Report Header */}
      <div className="bg-gradient-to-br from-indigo-600 via-blue-700 to-purple-800 text-white p-8 rounded-t-2xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Moon className="w-64 h-64" />
        </div>

        <div className="flex flex-col md:flex-row items-start justify-between gap-6 relative z-10">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30 shadow-inner">
              <Moon className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold mb-2 tracking-tight">Sleep Quality Analysis</h1>
              <p className="text-white/90 text-base font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Comprehensive Sleep Health Report
              </p>
            </div>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            {assessmentId && (
              <Button
                onClick={() => navigate(`/client/assessments/${assessmentId}/edit-sleep`)}
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-8 pt-6 border-t border-white/20">
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
              <Zap className="w-4 h-4 text-white/90" />
            </div>
            <div>
              <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">Primary Goal</p>
              <p className="font-semibold text-white">{getVal('health_goals.0', 'Better Sleep')}</p>
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
              <div className="w-1.5 h-8 bg-indigo-500 rounded-full shadow-sm"></div>
              <h2 className="text-2xl font-bold text-foreground">Sleep Dashboard</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Quality Score Card */}
              <div className={`p-8 rounded-2xl border-2 ${qColor.bg} ${qColor.border} flex flex-col justify-center`}>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <p className="text-sm uppercase tracking-wider text-muted-foreground font-bold mb-1">Sleep Quality Score</p>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-6xl font-black ${qColor.text}`}>{sleepQuality}</span>
                      <span className="text-2xl text-muted-foreground/60 font-medium">/10</span>
                    </div>
                  </div>
                  <Star className={`w-16 h-16 ${qColor.text} opacity-20`} />
                </div>
                <Progress value={sleepQuality * 10} className="h-4 bg-white/50" indicatorClassName={qColor.bar} />
                <p className={`mt-4 font-medium ${qColor.text}`}>
                  {sleepQuality >= 8 ? 'Excellent Sleep Health' : sleepQuality >= 5 ? 'Fair - Room for Improvement' : 'Poor - Attention Needed'}
                </p>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 p-5 rounded-xl border border-border/50">
                  <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                    <Clock className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs uppercase font-bold tracking-wide">Avg Duration</span>
                  </div>
                  <p className="text-2xl font-bold">{getVal('key_findings.sleep_hours')} <span className="text-sm font-normal text-muted-foreground">hrs</span></p>
                </div>
                <div className="bg-muted/30 p-5 rounded-xl border border-border/50">
                  <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                    <Moon className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs uppercase font-bold tracking-wide">Bedtime</span>
                  </div>
                  <p className="text-2xl font-bold">{getVal('key_findings.sleep_time')}</p>
                </div>
                <div className="bg-muted/30 p-5 rounded-xl border border-border/50">
                  <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                    <TrendingUp className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs uppercase font-bold tracking-wide">Energy Level</span>
                  </div>
                  <p className="text-2xl font-bold">{getVal('key_findings.energy_levels')}/10</p>
                </div>
                <div className="bg-muted/30 p-5 rounded-xl border border-border/50">
                  <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                    <Zap className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs uppercase font-bold tracking-wide">Wake Time</span>
                  </div>
                  <p className="text-2xl font-bold">{getVal('key_findings.wake_time')}</p>
                </div>
              </div>
            </div>
          </section>

          <Separator className="bg-border/60" />

          {/* Detailed Findings */}
          <div className="grid md:grid-cols-2 gap-10">
            {/* Disruptions */}
            <section className="flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-8 bg-rose-500 rounded-full shadow-sm"></div>
                <h2 className="text-xl font-bold text-foreground">Disruptions</h2>
              </div>

              <div className="bg-rose-50/50 rounded-2xl p-6 border border-rose-100 h-full">
                {assessment?.key_findings?.disruptions?.length > 0 ? (
                  <ul className="space-y-3">
                    {assessment.key_findings.disruptions.map((d: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-rose-900/80">
                        <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                        <span className="text-sm font-medium">{d}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-rose-900/60 italic">No significant disruptions reported.</p>
                )}
              </div>
            </section>

            {/* Lifestyle Factors */}
            <section className="flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-8 bg-purple-500 rounded-full shadow-sm"></div>
                <h2 className="text-xl font-bold text-foreground">Bedtime Routine</h2>
              </div>

              <div className="bg-purple-50/50 rounded-2xl p-6 border border-purple-100 h-full">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                    <Moon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-purple-900 mb-2">Analysis</h4>
                    <p className="text-sm text-purple-800/80 leading-relaxed">
                      {getVal('lifestyle.bedtime_routine_analysis', 'Routine analysis not available.')}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <Separator className="bg-border/60" />

          {/* Professional Analysis */}
          {assessment?.ai_analysis && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-8 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full shadow-sm"></div>
                <h2 className="text-2xl font-bold text-foreground">Professional Analysis & Strategy</h2>
              </div>

              <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-transparent rounded-2xl p-8 border-2 border-indigo-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <Sparkles className="w-32 h-32 text-indigo-500" />
                </div>

                <div className="prose prose-lg max-w-none">
                  <div className="text-foreground/90 leading-relaxed whitespace-pre-wrap bg-white/60 dark:bg-black/20 rounded-xl p-6 border border-indigo-100 backdrop-blur-sm">
                    {assessment.ai_analysis.replace(/#/g, '')}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Recommendations */}
          {assessment?.recommendations && assessment.recommendations.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-8 bg-blue-500 rounded-full shadow-sm"></div>
                <h2 className="text-xl font-bold text-foreground">Recommendations</h2>
              </div>

              <div className="grid gap-3">
                {assessment.recommendations.map((rec: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-4 p-4 bg-blue-50/50 border border-blue-100 hover:bg-blue-50 transition-colors rounded-xl">
                    <div className="mt-0.5 p-1 bg-blue-100 text-blue-600 rounded-full">
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
              <h4 className="font-semibold text-amber-900 mb-1">Medical Disclaimer</h4>
              <p className="text-sm text-amber-800/80 leading-relaxed">
                This sleep quality assessment is for wellness optimization only. Persistent sleep issues should be discussed with a healthcare provider.
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
