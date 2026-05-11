import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Brain, Calendar, User, TrendingUp, Sparkles, CheckCircle, AlertCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

interface StressCardViewProps {
  data: any;
  assessmentId?: string;
  onDownloadPDF?: () => void;
}

export function StressCardView({ data, assessmentId, onDownloadPDF }: StressCardViewProps) {
  const assessment = data?.assessment_data || data;
  const formResponses = data?.form_responses || {};
  const clientName = data?.client_name || "Client";

  // PSS-10 Questions
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

  const pssLabels0to4 = ['Never', 'Almost Never', 'Sometimes', 'Fairly Often', 'Very Often'];
  const pssLabels1to5 = ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'];

  // Calculate PSS Score
  const calculatePSSScore = () => {
    let total = 0;
    try {
      total += parseInt(formResponses.pss_q1_upset_unexpectedly || '0');
      total += parseInt(formResponses.pss_q2_unable_to_control || '0');
      total += Math.max(0, parseInt(formResponses.pss_q3_nervous_stressed || '1') - 1);
      total += Math.max(0, parseInt(formResponses.pss_q4_confident_handling_problems || '1') - 1);
      total += Math.max(0, parseInt(formResponses.pss_q5_things_going_your_way || '1') - 1);
      total += Math.max(0, parseInt(formResponses.pss_q6_could_not_cope || '1') - 1);
      total += Math.max(0, parseInt(formResponses.pss_q7_control_irritations || '1') - 1);
      total += Math.max(0, parseInt(formResponses.pss_q8_on_top_of_things || '1') - 1);
      total += Math.max(0, parseInt(formResponses.pss_q9_angered_outside_control || '1') - 1);
      total += Math.max(0, parseInt(formResponses.pss_q10_difficulties_piling_up || '1') - 1);
    } catch (e) {
      console.error("Error calculating PSS score", e);
      return 0;
    }
    return total;
  };

  const interpretPSSScore = (score: number) => {
    if (score <= 13) return {
      level: "Low Stress",
      description: "You're managing stress well and maintaining good coping mechanisms",
      color: "text-emerald-700",
      bgColor: "bg-emerald-50",
      borderColor: "border-emerald-200",
      emoji: "😊"
    };
    if (score <= 26) return {
      level: "Moderate Stress",
      description: "Some stressors are present - let's work on coping strategies",
      color: "text-amber-700",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-200",
      emoji: "😐"
    };
    return {
      level: "High Stress",
      description: "Significant stress levels detected - professional support recommended",
      color: "text-rose-700",
      bgColor: "bg-rose-50",
      borderColor: "border-rose-200",
      emoji: "😰"
    };
  };

  const pssScore = calculatePSSScore();
  const interpretation = interpretPSSScore(pssScore);
  const stressPercentage = (pssScore / 40) * 100;
  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Report Header */}
      <div className="bg-gradient-to-br from-primary via-primary/95 to-primary/90 text-white p-8 rounded-t-2xl shadow-lg">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold mb-1">Stress Assessment Report</h1>
              <p className="text-white/90 text-sm">Perceived Stress Scale (PSS-10) Analysis</p>
            </div>
          </div>
          {onDownloadPDF && (
            <Button onClick={onDownloadPDF} variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-white/30">
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          )}
        </div>

        {/* Report Info */}
        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/20">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-white/80" />
            <div>
              <p className="text-xs text-white/70 uppercase tracking-wide">Client Name</p>
              <p className="font-semibold">{clientName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-white/80" />
            <div>
              <p className="text-xs text-white/70 uppercase tracking-wide">Report Date</p>
              <p className="font-semibold">{currentDate}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Report Body */}
      <Card className="rounded-t-none shadow-lg border-t-0">
        <CardContent className="p-8 space-y-8">

          {/* Executive Summary */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-6 bg-primary rounded-full"></div>
              <h2 className="text-xl font-bold text-gray-900">Executive Summary</h2>
            </div>

            <div className={`p-6 rounded-xl border-2 ${interpretation.borderColor} ${interpretation.bgColor}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-600 mb-2">Overall Stress Level</p>
                  <div className="flex items-center gap-3">
                    <span className={`text-4xl font-bold ${interpretation.color}`}>{pssScore}</span>
                    <span className="text-2xl text-gray-400">/</span>
                    <span className="text-2xl text-gray-500">40</span>
                  </div>
                </div>
                <div className="text-5xl">{interpretation.emoji}</div>
              </div>

              <Progress value={stressPercentage} className="h-3 mb-4" />

              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${interpretation.bgColor} border ${interpretation.borderColor}`}>
                <span className={`font-bold ${interpretation.color}`}>{interpretation.level}</span>
              </div>

              <p className={`mt-4 text-sm ${interpretation.color}`}>{interpretation.description}</p>
            </div>
          </section>

          <Separator className="my-8" />

          {/* Assessment Details */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-6 bg-primary rounded-full"></div>
              <h2 className="text-xl font-bold text-gray-900">Assessment Details</h2>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <div className="flex items-center gap-2 mb-4 text-gray-700">
                <TrendingUp className="w-5 h-5" />
                <h3 className="font-semibold">PSS-10 Questionnaire Responses</h3>
              </div>

              <div className="space-y-3">
                {pssQuestions.map((q, index) => {
                  const score = formResponses[q.field];
                  // Safe extraction of score value - handle undefined, null, and ensure parsing
                  let scoreValue = 0;
                  if (score !== undefined && score !== null) {
                    const parsed = parseInt(score.toString());
                    scoreValue = isNaN(parsed) ? 0 : parsed;
                  } else {
                    scoreValue = q.scale === '0-4' ? 0 : 1;
                  }

                  const maxScore = q.scale === '0-4' ? 4 : 5;
                  const percentage = ((scoreValue - (q.scale === '1-5' ? 1 : 0)) / (maxScore - (q.scale === '1-5' ? 1 : 0))) * 100;
                  const labels = q.scale === '0-4' ? pssLabels0to4 : pssLabels1to5;
                  const labelIndex = q.scale === '0-4' ? scoreValue : scoreValue - 1;
                  const label = labels[Math.max(0, Math.min(labels.length - 1, labelIndex))];

                  return (
                    <div key={q.id} className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-sm transition-shadow">
                      <div className="flex items-start gap-3 mb-3">
                        <Badge variant="outline" className="shrink-0 bg-primary/5 text-primary border-primary/20 font-semibold">
                          {q.id}
                        </Badge>
                        <p className="text-sm text-gray-700 leading-relaxed flex-1">{q.text}</p>
                      </div>
                      <div className="flex items-center gap-3 ml-11">
                        <Progress value={percentage} className="flex-1 h-2" />
                        <Badge className={`shrink-0 ${percentage > 66 ? 'bg-rose-500' : percentage > 33 ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                          {label || 'Not answered'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <Separator className="my-8" />

          {/* Professional Analysis */}
          {assessment?.ai_analysis && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-6 bg-primary rounded-full"></div>
                <h2 className="text-xl font-bold text-gray-900">Professional Analysis & Recommendations</h2>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-xl p-6 border-2 border-emerald-200">
                <div className="flex items-center gap-2 mb-4 text-emerald-700">
                  <Sparkles className="w-5 h-5" />
                  <h3 className="font-semibold">Expert Review</h3>
                </div>

                <div className="prose prose-sm max-w-none">
                  <div className="text-gray-800 leading-relaxed whitespace-pre-wrap bg-white/60 rounded-lg p-5 border border-emerald-100">
                    {assessment.ai_analysis.replace(/#/g, '')}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Key Recommendations */}
          {assessment?.recommendations && assessment.recommendations.length > 0 && (
            <>
              <Separator className="my-8" />
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-primary rounded-full"></div>
                  <h2 className="text-xl font-bold text-gray-900">Action Items</h2>
                </div>

                <div className="grid gap-3">
                  {assessment.recommendations.map((rec: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200 hover:shadow-sm transition-shadow">
                      <CheckCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-800 flex-1">{rec}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Important Notice */}
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-900 mb-1">Important Note</h4>
                <p className="text-sm text-amber-800">
                  This assessment is designed to provide insights into your stress levels. If you're experiencing severe stress or mental health concerns, please consult with a healthcare professional.
                </p>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Report Footer */}
      <div className="bg-gray-100 p-6 rounded-b-2xl border-t text-center">
        <p className="text-sm text-gray-600">
          This report is confidential and intended for {clientName} only.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Generated by Sheizen Wellness • {currentDate}
        </p>
      </div>
    </div>
  );
}
