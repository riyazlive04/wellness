import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

interface ReportEditorProps {
    reportId?: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function ReportEditor({ reportId, open, onOpenChange, onSuccess }: ReportEditorProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        client_id: "",
        report_date: new Date().toISOString().split("T")[0],
        summary: "",
        content: "",
        status: "draft",
    });
    const { userRole } = useAuth();

    const canViewPersonalInfo = userRole === "admin";

    // Fetch clients for the dropdown
    const { data: clients } = useQuery({
        queryKey: ['clients-list'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("clients")
                .select("id, name, email")
                .order("name");
            if (error) throw error;
            return data;
        },
        enabled: open,
    });

    // Fetch report data if editing
    useEffect(() => {
        if (reportId && open) {
            fetchReportData();
        } else if (!reportId && open) {
            resetForm();
        }
    }, [reportId, open]);

    const fetchReportData = async () => {
        if (!reportId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("weekly_reports")
                .select("*")
                .eq("id", reportId)
                .single();

            if (error) throw error;

            if (data) {
                setFormData({
                    client_id: data.client_id,
                    report_date: data.report_date,
                    summary: data.summary || "",
                    content: data.content || "",
                    status: data.status,
                });
            }
        } catch (error) {
            toast.error("Failed to load report data");
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            client_id: "",
            report_date: new Date().toISOString().split("T")[0],
            summary: "",
            content: "",
            status: "draft",
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (!formData.client_id) {
                toast.error("Please select a client");
                return;
            }

            const payload = {
                client_id: formData.client_id,
                report_date: formData.report_date,
                summary: formData.summary,
                content: formData.content,
                status: formData.status,
            };

            if (reportId) {
                // Update
                const { error } = await supabase
                    .from("weekly_reports")
                    .update(payload)
                    .eq("id", reportId);
                if (error) throw error;
                toast.success("Report updated successfully");
            } else {
                // Create
                const { error } = await supabase
                    .from("weekly_reports")
                    .insert(payload);
                if (error) throw error;
                toast.success("Report created successfully");
            }

            onSuccess();
        } catch (error: any) {
            console.error("Error saving report:", error);
            toast.error("Failed to save report: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{reportId ? "Edit Report" : "New Report"}</DialogTitle>
                    <DialogDescription>
                        {reportId ? "Update existing weekly report" : "Create a new weekly report for a client"}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="client">Client *</Label>
                            <Select
                                value={formData.client_id}
                                onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                                disabled={!!reportId} // Disable client selection on edit to prevent accidental switching
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select client" />
                                </SelectTrigger>
                                <SelectContent>
                                    {clients?.map((client) => (
                                        <SelectItem key={client.id} value={client.id}>
                                            {client.name} {canViewPersonalInfo ? `(${client.email})` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="date">Report Date *</Label>
                            <Input
                                id="date"
                                type="date"
                                value={formData.report_date}
                                onChange={(e) => setFormData({ ...formData, report_date: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="summary">Summary</Label>
                        <Input
                            id="summary"
                            placeholder="Brief summary of the week"
                            value={formData.summary}
                            onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                        />
                    </div>

                    <div>
                        <Label htmlFor="content">Detailed Analysis</Label>
                        <div className="mt-1">
                            <Textarea
                                id="content"
                                className="min-h-[200px]"
                                placeholder="Write the full report here..."
                                value={formData.content}
                                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground mt-1">Supports plain text for now.</p>
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="status">Status</Label>
                        <Select
                            value={formData.status}
                            onValueChange={(value) => setFormData({ ...formData, status: value })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="published">Published</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                            "Published" reports will be visible to the client immediately.
                        </p>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Saving..." : "Save Report"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
