import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, Calendar, ChevronRight, Eye } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { ComprehensiveAssessmentReport } from "./ComprehensiveAssessmentReport";

interface ClientComprehensiveReportListProps {
    clientId: string;
}

export function ClientComprehensiveReportList({ clientId }: ClientComprehensiveReportListProps) {
    const [selectedReport, setSelectedReport] = useState<any | null>(null);

    const { data: reports, isLoading } = useQuery({
        queryKey: ['client-comprehensive-reports', clientId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('assessments')
                .select('*')
                .eq('client_id', clientId)
                .eq('status', 'sent')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!clientId,
    });

    if (isLoading) {
        return <div className="text-center py-8">Loading comprehensive reports...</div>;
    }

    if (!reports || reports.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border-2 border-dashed">
                <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-1">No Comprehensive Reports Yet</p>
                <p className="text-sm">Your detailed nutritional assessments will appear here once sent by your nutritionist.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-wellness-green/10 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-wellness-green" />
                </div>
                Comprehensive Nutritional Reports
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reports.map((report) => (
                    <Card
                        key={report.id}
                        className="group hover:shadow-md transition-all cursor-pointer border-l-4 border-l-wellness-green animate-fade-in"
                        onClick={() => setSelectedReport(report)}
                    >
                        <CardContent className="p-5">
                            <div className="flex items-start justify-between">
                                <div className="flex gap-4">
                                    <div className="bg-wellness-green/10 p-3 rounded-xl group-hover:bg-wellness-green/20 transition-colors">
                                        <ClipboardList className="w-6 h-6 text-wellness-green" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-lg leading-tight group-hover:text-wellness-green transition-colors">
                                            {report.display_name || "Nutritional Assessment"}
                                        </h4>
                                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {formatDate(report.updated_at)}
                                        </div>
                                    </div>
                                </div>
                                <div className="p-2 rounded-full bg-slate-50 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ChevronRight className="w-5 h-5 text-slate-400" />
                                </div>
                            </div>
                            
                            <div className="mt-4 pt-4 border-t flex justify-end">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="gap-2 interactive-button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedReport(report);
                                    }}
                                >
                                    <Eye className="w-4 h-4" />
                                    View Full Report
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Assessment Report View */}
            {selectedReport && (
                <ComprehensiveAssessmentReport
                    open={!!selectedReport}
                    onOpenChange={(open) => !open && setSelectedReport(null)}
                    data={selectedReport.form_responses}
                    clientName={selectedReport.display_name || "Nutritional Assessment"}
                />
            )}
        </div>
    );
}
