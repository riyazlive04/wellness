import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText, Edit, Trash2, Printer, Search, ArrowRight, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { ComprehensiveAssessmentForm } from "./ComprehensiveAssessmentForm";
import { ComprehensiveAssessmentReport } from "./ComprehensiveAssessmentReport";
import { SendAssessmentDialog } from "./SendAssessmentDialog";

export function ComprehensiveAssessmentManager() {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
    const [reportOpen, setReportOpen] = useState(false);
    const [selectedReportData, setSelectedReportData] = useState<any>(null);
    const [selectedClientName, setSelectedClientName] = useState("");
    const [sendDialogOpen, setSendDialogOpen] = useState(false);
    const { userRole } = useAuth();

    const canViewPersonalInfo = userRole === "admin";

    const { data: assessments, isLoading, refetch } = useQuery({
        queryKey: ['comprehensive-assessments'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('assessments')
                .select(`
                    *,
                    clients (id, name, email)
                `)
                .eq('assessment_type', 'custom')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
    });

    const filteredAssessments = assessments?.filter(a => {
        const matchesSearch = (a.display_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (a.clients?.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (a.clients?.email?.toLowerCase().includes(searchTerm.toLowerCase()));

        return matchesSearch && a.status === 'completed';
    });

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase
                .from('assessments')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success("Assessment deleted successfully");
            refetch();
        } catch (error) {
            console.error("Error deleting assessment:", error);
            toast.error("Failed to delete assessment");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-wellness-green">Comprehensive Assessments</h2>
                    <p className="text-muted-foreground">Manage all custom nutritional assessments and standalone reports</p>
                </div>
                <Button onClick={() => {
                    setSelectedAssessmentId(null);
                    setFormOpen(true);
                }} className="bg-wellness-green hover:bg-wellness-green/90">
                    <Plus className="mr-2 h-4 w-4" />
                    New Assessment
                </Button>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
            </div>

            {isLoading ? (
                <div className="grid gap-4">
                    {[1, 2, 3].map(i => (
                        <Card key={i} className="animate-pulse">
                            <CardContent className="h-24" />
                        </Card>
                    ))}
                </div>
            ) : filteredAssessments?.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="py-16 text-center text-muted-foreground">
                        <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p className="text-lg font-medium">No assessments found</p>
                        <p className="text-sm">Start by creating a new nutritional assessment</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {filteredAssessments?.map((assessment) => (
                        <Card key={assessment.id} className="group hover:border-wellness-green/50 transition-all shadow-sm hover:shadow-md">
                            <CardContent className="p-0">
                                <div className="flex flex-col sm:flex-row items-stretch">
                                    <div className="flex-1 p-6">
                                        <div className="flex flex-wrap items-center gap-3 mb-2">
                                            <h3 className="font-bold text-lg text-slate-800">
                                                {assessment.display_name || assessment.clients?.name || 'Unnamed Report'}
                                            </h3>
                                            <Badge variant={assessment.status === 'completed' ? 'default' : 'secondary'} className={
                                                assessment.status === 'completed'
                                                    ? "bg-wellness-green/20 text-wellness-green hover:bg-wellness-green/30 border-none"
                                                    : "bg-wellness-amber/20 text-wellness-amber hover:bg-wellness-amber/30 border-none"
                                            }>
                                                {assessment.status}
                                            </Badge>
                                            {assessment.client_id ? (
                                                <Badge variant="outline" className="border-wellness-green/30 text-wellness-green/70">
                                                    Linked to Client
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="border-slate-300 text-slate-500">
                                                    Standalone
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <FileText className="h-3.5 w-3.5" />
                                                Nutritional Assessment
                                            </div>
                                            <div>
                                                Created: {formatDate(assessment.created_at)}
                                            </div>
                                            {assessment.clients?.email && userRole === "admin" && (
                                                <div className="truncate max-w-[200px]">
                                                    {assessment.clients.email}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 px-6 py-4 sm:border-l bg-slate-50/50 group-hover:bg-wellness-green/5 transition-colors">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setSelectedAssessmentId(assessment.id);
                                                setSendDialogOpen(true);
                                            }}
                                            className="bg-white hover:bg-wellness-green hover:text-white border-slate-200"
                                            title="Send to Client"
                                        >
                                            <Send className="h-4 w-4 mr-2" />
                                            Send
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setSelectedReportData(assessment.form_responses);
                                                setSelectedClientName(assessment.display_name || assessment.clients?.name || "");
                                                setReportOpen(true);
                                            }}
                                            className="bg-white hover:bg-wellness-green hover:text-white border-slate-200"
                                            title="View Report"
                                        >
                                            <Printer className="h-4 w-4 mr-2" />
                                            Report
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setSelectedAssessmentId(assessment.id);
                                                setFormOpen(true);
                                            }}
                                            className="bg-white hover:bg-slate-100"
                                            title="Edit Assessment"
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
                                                    <AlertDialogTitle>Delete Assessment?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will permanently delete the assessment for {assessment.display_name || assessment.clients?.name}.
                                                        This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDelete(assessment.id)} className="bg-destructive hover:bg-destructive/90">
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>

                                        {assessment.client_id && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => window.open(`/admin/client/${assessment.client_id}`, '_blank')}
                                                title="Go to Client Profile"
                                            >
                                                <ArrowRight className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <ComprehensiveAssessmentForm
                clients={[]} // Pass empty list as they can search anyway or it's handled by lead matching
                open={formOpen}
                onOpenChange={setFormOpen}
                assessmentId={selectedAssessmentId}
                onSuccess={() => {
                    refetch();
                    setFormOpen(false);
                    setSelectedAssessmentId(null);
                }}
            />

            <ComprehensiveAssessmentReport
                open={reportOpen}
                onOpenChange={setReportOpen}
                data={selectedReportData}
                clientName={selectedClientName}
            />

            <SendAssessmentDialog
                open={sendDialogOpen}
                onOpenChange={setSendDialogOpen}
                assessmentId={selectedAssessmentId}
                onSuccess={() => {
                    refetch();
                    setSendDialogOpen(false);
                }}
            />
        </div>
    );
}
