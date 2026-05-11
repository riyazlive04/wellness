import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText, Edit, Trash2, Eye } from "lucide-react";
import { ReportEditor } from "./ReportEditor";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDate } from "@/lib/formatters";

export function ReportManager() {
    const [editorOpen, setEditorOpen] = useState(false);
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const { userRole } = useAuth();

    const canViewPersonalInfo = userRole === "admin";

    const { data: reports, refetch, isLoading } = useQuery({
        queryKey: ['weekly-reports'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('weekly_reports')
                .select(`
          *,
          clients (name, email)
        `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
    });

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase
                .from('weekly_reports')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success("Report deleted successfully");
            refetch();
        } catch (error) {
            console.error("Error deleting report:", error);
            toast.error("Failed to delete report");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Weekly Reports</h2>
                    <p className="text-muted-foreground">Create and manage client progress reports</p>
                </div>
                <Button onClick={() => {
                    setSelectedReportId(null);
                    setEditorOpen(true);
                }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Report
                </Button>
            </div>

            {isLoading ? (
                <div className="text-center py-12">Loading reports...</div>
            ) : reports?.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg mb-2">No reports found</p>
                        <p className="text-sm">Create your first weekly report to get started</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {reports?.map((report) => (
                        <Card key={report.id} className="hover:bg-muted/50 transition-colors">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-lg">{report.clients?.name || 'Unknown Client'}</h3>
                                            <Badge variant={report.status === 'published' ? 'default' : 'secondary'}>
                                                {report.status}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Report Date: {formatDate(report.report_date)}
                                        </p>
                                        {report.summary && (
                                            <p className="text-sm mt-1 line-clamp-1">{report.summary}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setSelectedReportId(report.id);
                                                setEditorOpen(true);
                                            }}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete Report?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This action cannot be undone. This will permanently delete the report
                                                        for {report.clients?.name}.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDelete(report.id)} className="bg-destructive hover:bg-destructive/90">
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <ReportEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                reportId={selectedReportId}
                onSuccess={() => {
                    refetch();
                    setEditorOpen(false);
                }}
            />
        </div>
    );
}
