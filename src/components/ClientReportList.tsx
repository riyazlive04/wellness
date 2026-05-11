import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FileText, Calendar, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/formatters";

interface ClientReportListProps {
    clientId: string;
}

export function ClientReportList({ clientId }: ClientReportListProps) {
    const [selectedReport, setSelectedReport] = useState<any>(null);

    const { data: reports, isLoading } = useQuery({
        queryKey: ['client-reports', clientId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('weekly_reports')
                .select('*')
                .eq('client_id', clientId)
                .eq('status', 'published')
                .order('report_date', { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!clientId,
    });

    if (isLoading) {
        return <div className="text-center py-8">Loading reports...</div>;
    }

    if (!reports || reports.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">No reports available</p>
                <p className="text-sm">Reports from your nutritionist will appear here.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {reports.map((report) => (
                <Card
                    key={report.id}
                    className="hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedReport(report)}
                >
                    <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="bg-primary/10 p-3 rounded-lg">
                                <FileText className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg flex items-center gap-2">
                                    Weekly Report
                                    <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {formatDate(report.report_date)}
                                    </span>
                                </h3>
                                {report.summary && (
                                    <p className="text-sm text-muted-foreground line-clamp-1">{report.summary}</p>
                                )}
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </CardContent>
                </Card>
            ))}

            <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Weekly Report</DialogTitle>
                        <DialogDescription>
                            Date: {selectedReport && formatDate(selectedReport.report_date)}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedReport && (
                        <div className="space-y-4 mt-4">
                            {selectedReport.summary && (
                                <div className="bg-muted p-4 rounded-lg">
                                    <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Summary</h4>
                                    <p>{selectedReport.summary}</p>
                                </div>
                            )}

                            <div className="prose prose-sm max-w-none">
                                <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Detailed Analysis</h4>
                                <div className="whitespace-pre-wrap">{selectedReport.content}</div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
