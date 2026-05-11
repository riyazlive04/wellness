import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Printer, Download, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface ComprehensiveAssessmentReportProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: any;
    clientName: string;
}

export function ComprehensiveAssessmentReport({
    open,
    onOpenChange,
    data,
    clientName,
}: ComprehensiveAssessmentReportProps) {
    const { userRole } = useAuth();
    const isAdmin = userRole === "admin";

    if (!data) return null;

    const handlePrint = () => {
        window.print();
    };

    const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
        <div className="mb-8 break-inside-avoid">
            <h3 className="text-lg font-bold text-wellness-green border-b-2 border-wellness-green/20 pb-1 mb-4">
                {title}
            </h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {children}
            </div>
        </div>
    );

    const InfoRow = ({ label, value }: { label: string; value: any }) => {
        if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) return null;

        return (
            <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {label}
                </span>
                <span className="text-sm font-medium text-foreground">
                    {Array.isArray(value) ? value.join(", ") : String(value)}
                </span>
            </div>
        );
    };

    const FullWidthRow = ({ label, value }: { label: string; value: any }) => {
        if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) return null;

        return (
            <div className="col-span-2 flex flex-col gap-1 mt-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {label}
                </span>
                <div className="text-sm text-foreground whitespace-pre-wrap bg-muted/30 p-3 rounded-md border border-muted">
                    {Array.isArray(value) ? value.join(", ") : String(value)}
                </div>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[95vh] h-[95vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-xl border-none">
                <DialogHeader className="px-6 py-4 border-b bg-white flex flex-row items-center justify-between sticky top-0 z-10 print:hidden">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-wellness-green/10 rounded-lg">
                            <FileText className="h-5 w-5 text-wellness-green" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Assessment Report</DialogTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">Medical summary for {clientName}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mr-8">
                        <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                            <Printer className="h-4 w-4" />
                            Print / Download PDF
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto bg-slate-50 print:bg-white">
                    <div className="p-8 md:p-12 max-w-[210mm] mx-auto bg-white shadow-sm my-8 print:my-0 print:shadow-none print:p-0 print:max-w-none report-content">
                        {/* Report Header */}
                        <div className="flex justify-between items-start mb-12 border-b-4 border-wellness-green pb-8">
                            <div>
                                <h1 className="text-4xl font-extrabold text-wellness-green tracking-tight">SHEIZEN</h1>
                                <p className="text-wellness-green/70 font-medium tracking-[0.2em] text-xs mt-1 uppercase">WELLNESS & NUTRITION</p>
                            </div>
                            <div className="text-right">
                                <h2 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Nutritional Assessment</h2>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Date: {data.personal?.date_of_assessment || new Date().toLocaleDateString()}
                                </p>
                            </div>
                        </div>

                        {/* Personal Info */}
                        <Section title="1. Personal Information">
                            <InfoRow label="Client Name" value={data.personal?.name} />
                            <InfoRow label="Email Address" value={isAdmin ? data.personal?.email : "***@***.com"} />
                            <InfoRow label="Contact Number" value={isAdmin ? data.personal?.contact : "**********"} />
                            <InfoRow label="Age / Gender" value={isAdmin ? data.personal?.age_gender : "*** / ***"} />
                            <InfoRow label="Occupation" value={data.personal?.occupation} />
                            <InfoRow label="Marital Status" value={data.personal?.marital_status} />
                            <InfoRow label="Lifestyle" value={data.personal?.lifestyle} />
                            <InfoRow label="Purpose of Visit" value={data.personal?.purpose_of_visit} />
                        </Section>

                        {/* Anthropometric */}
                        <Section title="2. Anthropometric Measurements">
                            <InfoRow label="Height (cm)" value={data.anthropometric?.height} />
                            <InfoRow label="Weight (kg)" value={data.anthropometric?.weight} />
                            <InfoRow label="BMI" value={data.anthropometric?.bmi} />
                            <InfoRow label="Waist Circumference" value={data.anthropometric?.waist_circumference} />
                            <InfoRow label="Hip Circumference" value={data.anthropometric?.hip_circumference} />
                            <InfoRow label="Waist-Hip Ratio" value={data.anthropometric?.waist_hip_ratio} />
                            <InfoRow label="MUAC" value={data.anthropometric?.muac} />
                            <InfoRow label="Ideal Body Weight" value={data.anthropometric?.ideal_body_weight} />
                            <InfoRow label="Weight Change %" value={data.anthropometric?.weight_change_percent} />
                            <InfoRow label="Body Fat %" value={data.anthropometric?.body_fat_percent} />
                            <FullWidthRow label="Interpretation" value={data.anthropometric?.interpretation} />
                        </Section>

                        {/* Biochemical */}
                        <Section title="3. Biochemical Parameters">
                            <InfoRow label="FBS / PPBS" value={data.biochemical?.fbs_ppbs} />
                            <InfoRow label="HbA1c" value={data.biochemical?.hba1c} />
                            <InfoRow label="Lipid Profile" value={data.biochemical?.lipid_profile} />
                            <InfoRow label="Hemoglobin" value={data.biochemical?.hemoglobin} />
                            <InfoRow label="Vitamin D" value={data.biochemical?.vitamin_d} />
                            <InfoRow label="Vitamin B12" value={data.biochemical?.vitamin_b12} />
                            <InfoRow label="Iron / Ferritin" value={data.biochemical?.serum_iron_ferritin} />
                            <InfoRow label="Serum Calcium" value={data.biochemical?.serum_calcium} />
                            <InfoRow label="Thyroid Function" value={data.biochemical?.thyroid_function} />
                            <InfoRow label="LFT / RFT" value={data.biochemical?.lft_rft} />
                            <FullWidthRow label="Interpretation" value={data.biochemical?.interpretation} />
                        </Section>

                        {/* Clinical */}
                        <Section title="4. Clinical Assessment">
                            <InfoRow label="General Appearance" value={data.clinical?.general_appearance} />
                            <InfoRow label="Skin / Hair / Nails" value={data.clinical?.skin_hair_nails} />
                            <InfoRow label="Oral Cavity" value={data.clinical?.oral_cavity} />
                            <InfoRow label="Sleep Pattern" value={data.clinical?.sleep_pattern} />
                            <InfoRow label="Stress / Anxiety" value={data.clinical?.stress_anxiety} />
                            <InfoRow label="Appetite" value={data.clinical?.appetite} />
                            <InfoRow label="Bowel Habits" value={data.clinical?.bowel_habits} />
                            <FullWidthRow label="Medical History" value={data.clinical?.medical_history} />
                            <FullWidthRow label="Family History" value={data.clinical?.family_history} />
                            <FullWidthRow label="Current Medications" value={data.clinical?.current_medications} />
                        </Section>

                        {/* Dietary */}
                        <Section title="5. Dietary & Lifestyle">
                            <InfoRow label="Diet Preference" value={data.dietary?.diet_preference} />
                            <InfoRow label="Cooking Resp." value={data.dietary?.cooking_responsibility} />
                            <InfoRow label="Water Intake" value={data.lifestyle?.water_intake} />
                            <InfoRow label="Meal Timing" value={data.lifestyle?.meal_timing} />
                            <InfoRow label="Eating Speed" value={data.lifestyle?.eating_speed} />
                            <InfoRow label="Emotional Eating" value={data.lifestyle?.emotional_eating} />
                            <InfoRow label="Exercise Type" value={data.lifestyle?.exercise_type} />
                            <InfoRow label="Exercise Duration" value={data.lifestyle?.exercise_duration} />
                            <FullWidthRow label="24-Hour Recall Summary" value={data.dietary?.recall_24hr} />
                        </Section>

                        {/* Diagnosis & Plan */}
                        <Section title="6. Nutritional Diagnosis & Plan">
                            <FullWidthRow label="Nutritional Diagnosis" value={data.diagnosis_plan?.nutritional_diagnosis} />
                            <FullWidthRow label="Counselling Summary" value={data.diagnosis_plan?.counselling_summary} />
                            <FullWidthRow label="Follow-up Plan" value={data.diagnosis_plan?.follow_up_plan} />
                        </Section>

                        {/* Footer */}
                        <div className="mt-16 pt-8 border-t border-wellness-green/30 text-center flex justify-between items-end">
                            <div className="text-left">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Generated By</p>
                                <p className="text-sm font-bold text-wellness-green">Sheizen Wellness System</p>
                            </div>
                            <div className="text-right">
                                <div className="h-12 w-48 border-b border-slate-300 mb-2"></div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold text-center">Authorized Signature</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CSS for print mode */}
                <style dangerouslySetInnerHTML={{
                    __html: `
          @media print {
            /* 1. Reset Page and Base Layout */
            @page {
              margin: 1.5cm;
              size: A4;
            }
            
            html, body {
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
            }

            /* 2. Hide everything NOT related to the report */
            body > *:not([data-radix-portal]) {
              display: none !important;
            }

            /* 3. Force Portal and Dialog to be static flow elements */
            [data-radix-portal], 
            [data-radix-portal] > div, 
            div[role="dialog"] {
              position: static !important;
              display: block !important;
              height: auto !important;
              max-height: none !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              box-shadow: none !important;
              border: none !important;
              transform: none !important;
              inset: auto !important; /* Remove fixed/absolute positioning */
            }

            /* Hide Overlay/Backdrop */
            div[data-state="open"][style*="fixed"] {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
            }

            /* 4. Target the Inner Content */
            .flex-1.overflow-y-auto {
                display: block !important;
                height: auto !important;
                overflow: visible !important;
                padding: 0 !important;
                margin: 0 !important;
            }

            .report-content {
              display: block !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              height: auto !important;
              overflow: visible !important;
              border: none !important;
            }

            /* 5. UI elements to hide */
            .print\\:hidden, 
            button, 
            header {
              display: none !important;
            }

            /* 6. Fix section breaking */
            .break-inside-avoid {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              margin-bottom: 2rem !important;
              display: block !important;
            }

            /* 7. Typography contrast for print */
            h3 {
                color: #2D5A27 !important;
                border-bottom: 1px solid #CCCCCC !important;
            }
          }
        `}} />
            </DialogContent>
        </Dialog>
    );
}
