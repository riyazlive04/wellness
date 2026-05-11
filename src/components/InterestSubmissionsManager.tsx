import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Mail, Phone, User, Calendar, MoreHorizontal, FileText, CheckCircle, XCircle, Clock, MessageCircle, Trash2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/formatters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

interface InterestSubmission {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  email: string;
  health_goal: string;
  message?: string;
  created_at: string;
  status: string;
}

const healthGoalLabels: Record<string, string> = {
  weight_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  diabetes: "Diabetes Management",
  pcos: "PCOS Management",
  lifestyle_correction: "Lifestyle Correction",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  contacted: "bg-blue-100 text-blue-800 border-blue-300",
  converted: "bg-green-100 text-green-800 border-green-300",
  not_interested: "bg-gray-100 text-gray-800 border-gray-300",
};

import { ComprehensiveAssessmentForm } from "@/components/ComprehensiveAssessmentForm";
import { AdminClientEditor } from "@/components/AdminClientEditor";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<"clients">;

export function InterestSubmissionsManager({ clients }: { clients?: Client[] }) {
  const [submissions, setSubmissions] = useState<InterestSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterHealthGoal, setFilterHealthGoal] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const { userRole } = useAuth();

  const canViewPersonalInfo = userRole === "admin";

  // Assessment Form State
  const [assessmentClientId, setAssessmentClientId] = useState<string | undefined>(undefined);
  const [assessmentOpen, setAssessmentOpen] = useState(false);

  // Client Conversion State
  const [clientEditorOpen, setClientEditorOpen] = useState(false);
  const [clientEditorInitialData, setClientEditorInitialData] = useState<any>(undefined);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("interest_forms" as any)
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSubmissions((data as unknown as InterestSubmission[]) || []);
    } catch (error) {
      console.error("Error fetching submissions:", error);
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("interest_forms" as any)
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;

      toast.success("Status updated successfully");
      fetchSubmissions();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("interest_forms" as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      toast.success("Lead deleted successfully");
      fetchSubmissions();
    } catch (error) {
      console.error("Error deleting lead:", error);
      toast.error("Failed to delete lead");
    }
  };

  const handleOpenAssessment = (submission: InterestSubmission) => {
    const matchedClient = clients?.find(c =>
      c.email === submission.email ||
      c.phone === submission.phone
    );

    const leadData = {
      name: submission.name,
      email: submission.email,
      phone: submission.phone,
      age: submission.age?.toString() || "",
      gender: submission.gender?.toLowerCase() || "",
      program_type: healthGoalLabels[submission.health_goal] ? undefined : "others",
      goals: submission.health_goal || "",
    };
    setClientEditorInitialData(leadData);

    if (matchedClient) {
      setAssessmentClientId(matchedClient.id);
    } else {
      setAssessmentClientId(undefined);
    }
    setAssessmentOpen(true);
  };



  const filteredSubmissions = submissions.filter((sub) => {
    let matchesStatus = true;
    let matchesHealthGoal = true;

    if (filterStatus !== "all") {
      matchesStatus = sub.status === filterStatus;
    }

    if (filterHealthGoal !== "all") {
      matchesHealthGoal = sub.health_goal === filterHealthGoal;
    }

    return matchesStatus && matchesHealthGoal;
  });

  const stats = {
    total: submissions.length,
    pending: submissions.filter((s) => s.status === "pending").length,
    contacted: submissions.filter((s) => s.status === "contacted").length,
    converted: submissions.filter((s) => s.status === "converted").length,
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Interest Form Submissions</CardTitle>
          <CardDescription>Loading submissions...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card
          className={`cursor-pointer transition-colors hover:bg-muted/50 ${filterStatus === "all" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilterStatus("all")}
        >
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total Submissions</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors hover:bg-yellow-50 ${filterStatus === "pending" ? "ring-2 ring-yellow-500 bg-yellow-50" : ""}`}
          onClick={() => setFilterStatus("pending")}
        >
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors hover:bg-blue-50 ${filterStatus === "contacted" ? "ring-2 ring-blue-500 bg-blue-50" : ""}`}
          onClick={() => setFilterStatus("contacted")}
        >
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{stats.contacted}</div>
            <p className="text-xs text-muted-foreground">Contacted</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors hover:bg-green-50 ${filterStatus === "converted" ? "ring-2 ring-green-500 bg-green-50" : ""}`}
          onClick={() => setFilterStatus("converted")}
        >
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.converted}</div>
            <p className="text-xs text-muted-foreground">Converted</p>
          </CardContent>
        </Card>
      </div>

      {/* Submissions Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Interest Form Submissions</CardTitle>
              <CardDescription>Manage leads from the interest form</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {clients && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setAssessmentClientId(undefined);
                    setAssessmentOpen(true);
                  }}
                >
                  <FileText className="h-4 w-4" />
                  Assessment Form
                </Button>
              )}
              <Select value={filterHealthGoal} onValueChange={setFilterHealthGoal}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Health Goals" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Health Goals</SelectItem>
                  {Object.entries(healthGoalLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredSubmissions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No submissions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Age/Gender</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Health Goal</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSubmissions.map((submission) => (
                        <TableRow key={submission.id}>
                          <TableCell className="font-medium">{submission.name}</TableCell>
                          <TableCell>
                            {(userRole === "admin" || userRole === "manager") ? `${submission.age} / ${submission.gender}` : "Restricted"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 text-sm">
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs">{userRole === "admin" ? submission.phone : "**********"}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs">{userRole === "admin" ? submission.email : "**********"}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {healthGoalLabels[submission.health_goal] || submission.health_goal}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground line-clamp-2 max-w-[200px]" title={submission.message}>
                              {submission.message || "-"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {formatDate(submission.created_at)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[submission.status]}>
                              {submission.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Direct Assessment Action Button */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                onClick={() => handleOpenAssessment(submission)}
                                title="Create Assessment"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <CheckCircle className="mr-2 h-4 w-4" />
                                      Update Status
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      <DropdownMenuItem onClick={() => updateStatus(submission.id, "pending")}>
                                        <Clock className="mr-2 h-4 w-4" /> Pending
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => updateStatus(submission.id, "contacted")}>
                                        <MessageCircle className="mr-2 h-4 w-4" /> Contacted
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => updateStatus(submission.id, "converted")}>
                                        <CheckCircle className="mr-2 h-4 w-4" /> Converted
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => updateStatus(submission.id, "not_interested")}>
                                        <XCircle className="mr-2 h-4 w-4" /> Not Interested
                                      </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>

                                  <DropdownMenuSeparator />
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete Lead
                                      </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will remove the lead for <strong>{submission.name}</strong> from the list.
                                          This action can be undone by an administrator in the database.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDelete(submission.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div >
          )
          }
        </CardContent >
      </Card >

      {/* Assessment Form Global Instance */}
      {
        clients && (
          <ComprehensiveAssessmentForm
            clients={clients}
            initialClientId={assessmentClientId}
            initialData={assessmentClientId ? undefined : clientEditorInitialData}
            open={assessmentOpen}
            onOpenChange={setAssessmentOpen}
          />
        )
      }

      {/* Client Editor for Auto-Conversion */}
      {
        clientEditorOpen && (
          <AdminClientEditor
            open={clientEditorOpen}
            onOpenChange={setClientEditorOpen}
            initialData={clientEditorInitialData}
            onSuccess={(newClientId) => {
              if (newClientId) {
                // If client created successfully, immediately open assessment for them
                setAssessmentClientId(newClientId);
                setAssessmentOpen(true);
              }
            }}
          />
        )
      }
    </div >
  );
}
