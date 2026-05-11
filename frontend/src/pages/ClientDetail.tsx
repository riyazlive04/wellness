import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Phone, Mail, Target, Weight, Calendar, Trash2, Image as ImageIcon, Download, Activity, Edit, Plus } from "lucide-react";
import { toast } from "sonner";
import { AssessmentUploadDialog } from "@/components/AssessmentUploadDialog";
import { EditAssessmentDialog } from "@/components/EditAssessmentDialog";
import { WeeklyPlanEditor } from "@/components/WeeklyPlanEditor";
import { ProgressCharts } from "@/components/ProgressCharts";
import { formatServiceType, getServiceTypeBadgeColor, formatDate, formatDateTime } from "@/lib/formatters";
import { GroceryListGenerator } from "@/components/GroceryListGenerator";
import { getSignedUrl } from "@/lib/storage";
import { MealPhotoDisplay } from "@/components/MealPhotoDisplay";
import { MessageFeed } from "@/components/MessageFeed";
import { MessageComposer } from "@/components/MessageComposer";
import { type Message, getUnreadCount, markMessagesAsRead } from "@/lib/messages";
import { CalendarView } from "@/components/CalendarView";
import { HundredDayProgress } from "@/components/HundredDayProgress";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { exportDietPlanToExcel } from "@/lib/excelExport";
import { FileText, Brain, Moon, FileEdit, HeartPulse, Printer } from "lucide-react";
import { AdminNotes } from "@/components/admin/AdminNotes";
import { ComprehensiveAssessmentForm } from "@/components/ComprehensiveAssessmentForm";
import { ComprehensiveAssessmentReport } from "@/components/ComprehensiveAssessmentReport";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PendingReviewDashboard } from "@/components/PendingReviewDashboard";
import { HealthAssessmentCardEditor } from "@/components/HealthAssessmentCardEditor";
import { StressCardEditor } from "@/components/StressCardEditor";
import { SleepCardEditor } from "@/components/SleepCardEditor";

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  age: number | null;
  gender: string | null;
  goals: string | null;
  program_type: string | null;
  service_type: string | null;
  status: string | null;
  target_kcal: number | null;
  last_weight: number | null;
  created_at: string;
}

interface Assessment {
  id: string;
  file_name: string | null;
  file_url: string | null;
  notes: string | null;
  created_at: string;
}

interface WeeklyPlan {
  id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  status: string | null;
  total_kcal: number | null;
  pdf_url: string | null;
  published_at: string | null;
}

interface DailyLog {
  id: string;
  log_date: string;
  weight: number | null;
  water_intake: number | null;
  activity_minutes: number | null;
  notes: string | null;
}

interface FileRecord {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface WeeklyReport {
  id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  summary: string | null;
  pdf_url: string | null;
  audio_url: string | null;
  created_at: string;
}

interface MealLog {
  id: string;
  meal_type: string;
  meal_name: string | null;
  photo_url: string | null;
  kcal: number | null;
  notes: string | null;
  logged_at: string;
}

// Helper: Show a native browser notification using new Notification() directly
function showBrowserNotification(title: string, body: string, _url: string) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        body,
        icon: '/icon-192.png',
        tag: `sheizen-${Date.now()}`,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (err) {
      console.error('[Notify] Failed:', err);
    }
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        try {
          const n = new Notification(title, {
            body,
            icon: '/icon-192.png',
            tag: `sheizen-${Date.now()}`,
          });
          n.onclick = () => { window.focus(); n.close(); };
        } catch (err) {
          console.error('[Notify] Failed:', err);
        }
      }
    });
  }
}

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRole, user } = useAuth();
  const queryClient = useQueryClient();
  const [deleteAssessmentId, setDeleteAssessmentId] = useState<string | null>(null);
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
  const [isRequestingAssessment, setIsRequestingAssessment] = useState(false);
  const [editAssessmentId, setEditAssessmentId] = useState<string | null>(null);
  const [customAssessmentOpen, setCustomAssessmentOpen] = useState(false);
  const [selectedCustomAssessmentId, setSelectedCustomAssessmentId] = useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [selectedReportData, setSelectedReportData] = useState<any>(null);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const [reviewCardId, setReviewCardId] = useState<string | null>(null);
  const [reviewCardType, setReviewCardType] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Helper: Managers cannot view personal client info
  const canViewPersonalInfo = userRole === "admin";

  useEffect(() => {
    if (userRole !== "admin" && userRole !== "manager") {
      navigate("/auth");
      return;
    }

    if (!id) {
      toast.error("Invalid client ID");
      navigate("/admin");
      return;
    }
  }, [id, userRole, navigate]);

  const fetchClientData = async () => {
    if (!id) throw new Error("No client ID");

    // Fetch client details
    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (clientError) throw clientError;

    // Fetch assessments
    const { data: assessmentsData } = await supabase
      .from("assessments")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false });

    // Fetch weekly plans
    const { data: plansData } = await supabase
      .from("weekly_plans")
      .select("*")
      .eq("client_id", id)
      .order("week_number", { ascending: false });

    // Fetch daily logs
    const { data: logsData } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("client_id", id)
      .order("log_date", { ascending: false })
      .limit(30);

    // Fetch files
    const { data: filesData } = await supabase
      .from("files")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false });

    // Fetch reports
    const { data: reportsData } = await supabase
      .from("weekly_reports")
      .select("*")
      .eq("client_id", id)
      .order("week_number", { ascending: false });

    // Fetch meal logs with photos
    const { data: mealLogsData } = await supabase
      .from("meal_logs")
      .select("*")
      .eq("client_id", id)
      .not("photo_url", "is", null)
      .order("logged_at", { ascending: false })
      .limit(50);

    // Fetch assessment request counts for this client
    const { data: assessmentRequestsData } = await supabase
      .from('assessment_requests')
      .select('assessment_type')
      .eq('client_id', id);

    // Fetch pending review cards for counts
    const { data: pendingReviewCardsData } = await supabase
      .from('pending_review_cards')
      .select('card_type')
      .eq('client_id', id)
      .in('status', ['pending', 'edited']);

    // Count assessment requests by type (unifying naming)
    const assessmentRequests = (assessmentRequestsData || []);
    const pendingCards = (pendingReviewCardsData || []);

    const healthRequestCount = assessmentRequests.filter(a =>
      a.assessment_type === 'health_assessment' || a.assessment_type === 'health'
    ).length + pendingCards.filter(c => c.card_type === 'health_assessment').length;

    const stressRequestCount = assessmentRequests.filter(a =>
      a.assessment_type === 'stress_assessment' || a.assessment_type === 'stress'
    ).length + pendingCards.filter(c => c.card_type === 'stress_card').length;

    const sleepRequestCount = assessmentRequests.filter(a =>
      a.assessment_type === 'sleep_assessment' || a.assessment_type === 'sleep'
    ).length + pendingCards.filter(c => c.card_type === 'sleep_card').length;

    return {
      client: clientData,
      assessments: (assessmentsData as unknown as Assessment[]) || [],
      plans: (plansData as unknown as WeeklyPlan[]) || [],
      dailyLogs: (logsData as unknown as DailyLog[]) || [],
      files: (filesData as unknown as FileRecord[]) || [],
      reports: (reportsData as unknown as WeeklyReport[]) || [],
      mealLogs: (mealLogsData as unknown as MealLog[]) || [],
      assessmentRequestCounts: {
        health: healthRequestCount,
        stress: stressRequestCount,
        sleep: sleepRequestCount,
      },
    };
  };

  const { data, isLoading } = useQuery({
    queryKey: ['admin-client-detail', id],
    queryFn: fetchClientData,
    enabled: !!id && (userRole === "admin" || userRole === "manager"),
  });

  const client = data?.client || null;
  const assessments = data?.assessments || [];
  const plans = data?.plans || [];
  const dailyLogs = data?.dailyLogs || [];
  const files = data?.files || [];
  const reports = data?.reports || [];
  const mealLogs = data?.mealLogs || [];

  const refetchClientData = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-client-detail', id] });
  };

  const fetchMessages = async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data as Message[]);
    }
  };

  const updateUnreadCount = async () => {
    if (!id) return;
    const viewerType = (userRole === 'admin' || userRole === 'manager') ? 'admin' : 'client';
    const count = await getUnreadCount(id, viewerType);
    setUnreadCount(count);
  };

  useEffect(() => {
    fetchMessages();
    updateUnreadCount();
  }, [id]);

  const handleMessagesTabOpen = async () => {
    if (id) {
      const viewerType = (userRole === 'admin' || userRole === 'manager') ? 'admin' : 'client';
      await markMessagesAsRead(id, viewerType);
      setUnreadCount(0);
    }
  };

  // Auto-request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      const timer = setTimeout(() => {
        Notification.requestPermission().then((perm) => {
          console.log('[Notify] Auto-permission result:', perm);
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Real-time messages subscription
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel('admin-messages-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `client_id=eq.${id}`
      }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages(prev => [...prev, newMsg]);
        if (newMsg.sender_type === 'client') {
          setUnreadCount(prev => prev + 1);
          showBrowserNotification(
            'New Message from Client',
            newMsg.content?.slice(0, 100) || 'You have a new message',
            `/admin/client/${id}`
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Real-time pending cards subscription
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel('admin-client-pending-cards-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pending_review_cards',
        filter: `client_id=eq.${id}`
      }, () => {
        console.log("Real-time update: client pending cards changed, refetching...");
        refetchClientData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "inactive":
        return "bg-gray-100 text-gray-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "completed":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleDeleteAssessment = async (assessmentId: string, fileUrl: string | null) => {
    try {
      if (fileUrl) {
        const urlParts = fileUrl.split("/");
        const filePath = urlParts.slice(-2).join("/");
        await supabase.storage.from("assessment-files").remove([filePath]);
      }

      const { error } = await supabase
        .from("assessments")
        .delete()
        .eq("id", assessmentId);

      if (error) throw error;

      toast.success("Assessment deleted successfully!");
      refetchClientData();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete assessment");
    } finally {
      setDeleteAssessmentId(null);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    try {
      const { error } = await supabase
        .from("weekly_plans")
        .delete()
        .eq("id", planId);

      if (error) throw error;

      toast.success("Plan deleted successfully!");
      refetchClientData();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete plan");
    } finally {
      setDeletePlanId(null);
    }
  };

  const handleDeleteFile = async (fileId: string, fileUrl: string, bucket: string = "client-files") => {
    try {
      // 1. Remove from storage
      // Extract path if full URL is given, or use as is
      let filePath = fileUrl;
      if (fileUrl.startsWith("http")) {
        const urlObj = new URL(fileUrl);
        const pathParts = urlObj.pathname.split(`/${bucket}/`);
        if (pathParts.length > 1) {
          filePath = pathParts[1];
        }
      }

      const { error: storageError } = await supabase.storage
        .from(bucket)
        .remove([filePath]);

      if (storageError) {
        console.error("Storage remove error:", storageError);
        // Proceed to DB delete anyway
      }

      // 2. Remove from database
      const { error: dbError } = await supabase
        .from("files")
        .delete()
        .eq("id", fileId);

      if (dbError) throw dbError;

      toast.success("File deleted successfully!");
      refetchClientData();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete file");
    } finally {
      setDeleteFileId(null);
    }
  };

  const handleMessageSent = (newMessage: Message) => {
    if (!newMessage) return;
    // Optimistically add the message to the list immediately
    setMessages(prev => {
      // Check if message already exists to avoid duplicates
      if (prev.some(msg => msg.id === newMessage.id)) {
        return prev;
      }
      return [...prev, newMessage];
    });
  };

  const handleRequestAssessment = async (assessmentType: string) => {
    setIsRequestingAssessment(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-assessment', {
        body: {
          client_id: id,
          assessment_type: assessmentType,
          notes: `Requested via admin dashboard`
        }
      });

      if (error) throw error;
      if (data && !data.success) {
        throw new Error(data.error || 'Failed to send assessment request');
      }

      toast.success('Assessment request sent to client');
      // Refresh client data to update assessment request counts
      refetchClientData();

      // Notify other tabs (client dashboard) via localStorage storage event
      const label = assessmentType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      try {
        localStorage.setItem('sheizen-notify', JSON.stringify({
          title: `New ${label} Requested`,
          body: `Your nutritionist has requested a ${label}. Please complete it.`,
          ts: Date.now(),
        }));
      } catch (e) {}
    } catch (error: any) {
      console.error('Error requesting assessment:', error);
      toast.error(error.message || 'Failed to send assessment request');
    } finally {
      setIsRequestingAssessment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Skeleton className="h-10 w-64 mb-6" />
        <Skeleton className="h-48 w-full mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="text-center">
          <p className="text-muted-foreground">Client not found</p>
          <Button onClick={() => navigate("/admin")} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        {/* Client Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <CardTitle className="text-2xl sm:text-3xl">{client.name}</CardTitle>
                  <Badge variant="outline" className="bg-wellness-blue/10 text-wellness-blue border-wellness-blue/20">
                    CLIENT
                  </Badge>
                </div>
                <CardDescription className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span className="break-all">
                      {userRole === "admin" ? client.email : "***@***.com"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {userRole === "admin" ? client.phone : "**********"}
                  </div>
                </CardDescription>
              </div>
              <Badge className={getStatusColor(client.status)}>
                {client.status || "N/A"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {client.service_type && (
              <div className="mb-4 pb-4 border-b">
                <p className="text-sm text-muted-foreground mb-2">Service Type</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm border ${(userRole === "admin" || userRole === "manager") ? getServiceTypeBadgeColor(client.service_type) : "bg-muted text-muted-foreground"}`}>
                  {(userRole === "admin" || userRole === "manager") ? formatServiceType(client.service_type) : "Restricted"}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Target Kcal</p>
                  <p className="font-semibold">{(userRole === "admin" || userRole === "manager") ? (client.target_kcal || "—") : "****"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Weight className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Last Weight</p>
                  <p className="font-semibold">
                    {(userRole === "admin" || userRole === "manager") ? (client.last_weight ? `${client.last_weight} kg` : "—") : "** kg"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Age</p>
                  <p className="font-semibold text-muted-foreground">
                    {(userRole === "admin" || userRole === "manager") ? (client.age || "—") : "***"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Program</p>
                <p className="font-semibold capitalize">{(userRole === "admin" || userRole === "manager") ? (client.program_type?.replace("_", " ") || "—") : "**********"}</p>
              </div>
            </div>
            {client.goals && (userRole === "admin" || userRole === "manager") && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-1">Goals</p>
                <p>{client.goals}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabbed Interface */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="notes">
              <FileEdit className="h-4 w-4 mr-2" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="assessments">Assessments ({assessments.length})</TabsTrigger>
            <TabsTrigger value="plans">Plans ({plans.length})</TabsTrigger>
            <TabsTrigger value="logs">Daily Logs ({dailyLogs.length})</TabsTrigger>
            <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
            <TabsTrigger value="reports">Reports ({reports.length})</TabsTrigger>
            <TabsTrigger value="messages" onClick={handleMessagesTabOpen}>
              Messages
              {unreadCount > 0 && (
                <span className="ml-2 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="workflow">
              <Activity className="h-4 w-4 mr-1" />
              Workflow
            </TabsTrigger>
            {client?.service_type === 'hundred_days' && (
              <TabsTrigger value="progress">100-Day Progress</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {dailyLogs.length > 0
                      ? formatDate(dailyLogs[0].log_date)
                      : "No logs"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Last log date</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Active Plans</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {plans.filter(p => p.status === "published").length}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Published plans</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Total Assessments</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{assessments.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Assessment files</p>
                </CardContent>
              </Card>
            </div>

            <ProgressCharts clientId={id!} daysToShow={30} />
          </TabsContent>

          <TabsContent value="notes">
            <AdminNotes clientId={id!} clientName={client.name} />
          </TabsContent>

          <TabsContent value="assessments">
            <div className="space-y-6">
              <Card>
                <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Assessments</CardTitle>
                    <CardDescription>View and manage client assessments</CardDescription>
                  </div>
                  <AssessmentUploadDialog clientId={id!} onSuccess={fetchClientData} />
                </CardHeader>
                <CardContent>
                  {assessments.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No assessments yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Display Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assessments.map((assessment) => (
                          <TableRow key={assessment.id}>
                            <TableCell>
                              {(assessment as any).display_name || assessment.file_name || "—"}
                            </TableCell>
                            <TableCell className="capitalize">
                              {(assessment as any).assessment_type || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={(assessment as any).status === 'sent' ? 'default' : 'outline'}>
                                {(assessment as any).status || 'draft'}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(assessment.created_at)}</TableCell>
                            <TableCell className="text-right space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditAssessmentId(assessment.id)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {(assessment as any).form_responses && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const assessmentType = (assessment as any).assessment_type;
                                    if (assessmentType === 'sleep') {
                                      navigate(`/admin/assessments/${assessment.id}/edit-sleep`);
                                    } else if (assessmentType === 'stress') {
                                      navigate(`/admin/assessments/${assessment.id}/edit-stress`);
                                    } else if (assessmentType === 'health') {
                                      navigate(`/admin/assessments/${assessment.id}/edit-health`);
                                    } else if (assessmentType === 'custom') {
                                      setSelectedCustomAssessmentId(assessment.id);
                                      setCustomAssessmentOpen(true);
                                    }
                                  }}
                                  title="Edit Form"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              )}
                              {(assessment as any).assessment_type === 'custom' && (assessment as any).form_responses && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedReportData((assessment as any).form_responses);
                                    setIsReportOpen(true);
                                  }}
                                  className="text-wellness-green border-wellness-green hover:bg-wellness-green hover:text-white"
                                  title="View Report"
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                              )}
                              {assessment.file_url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const signedUrl = await getSignedUrl("assessment-files", assessment.file_url);
                                      window.open(signedUrl, "_blank");
                                    } catch (error) {
                                      toast.error("Failed to open assessment file");
                                    }
                                  }}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteAssessmentId(assessment.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Request New Assessments</CardTitle>
                  <CardDescription>
                    To request assessments from this client, go to the <strong>Workflow</strong> tab and click the appropriate "Request Assessment" button.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="plans">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Weekly Plans</CardTitle>
                  <CardDescription>Manage client meal plans</CardDescription>
                </div>
                <WeeklyPlanEditor clientId={id!} onSuccess={fetchClientData} />
              </CardHeader>
              <CardContent>
                {plans.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No plans yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Week</TableHead>
                        <TableHead>Date Range</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total Kcal</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plans.map((plan) => (
                        <TableRow key={plan.id}>
                          <TableCell>Week {plan.week_number}</TableCell>
                          <TableCell>
                            {formatDate(plan.start_date)} - {formatDate(plan.end_date)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={plan.status === "published" ? "default" : "secondary"}>
                              {plan.status || "draft"}
                            </Badge>
                          </TableCell>
                          <TableCell>{plan.total_kcal || "—"}</TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const { data: mealCards } = await supabase
                                    .from('meal_cards')
                                    .select('*')
                                    .eq('plan_id', plan.id);

                                  exportDietPlanToExcel(
                                    {
                                      name: client.name,
                                      program_type: client.program_type
                                    },
                                    plan,
                                    mealCards || []
                                  );
                                  toast.success("Excel file downloaded successfully!");
                                } catch (error) {
                                  toast.error("Failed to export to Excel");
                                }
                              }}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Export
                            </Button>
                            <WeeklyPlanEditor clientId={id!} planId={plan.id} onSuccess={fetchClientData} />
                            <GroceryListGenerator
                              planId={plan.id}
                              weekNumber={plan.week_number}
                              startDate={plan.start_date}
                              endDate={plan.end_date}
                            />
                            {plan.pdf_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    const signedUrl = await getSignedUrl("weekly-plan-pdfs", plan.pdf_url);
                                    window.open(signedUrl, "_blank");
                                  } catch (error) {
                                    toast.error("Failed to open plan PDF");
                                  }
                                }}
                              >
                                View PDF
                              </Button>
                            )}
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeletePlanId(plan.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Daily Logs</CardTitle>
                  <CardDescription>Track daily progress and activities</CardDescription>
                </CardHeader>
                <CardContent>
                  {dailyLogs.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No logs yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Weight (kg)</TableHead>
                          <TableHead>Water (ml)</TableHead>
                          <TableHead>Activity (min)</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>{formatDate(log.log_date)}</TableCell>
                            <TableCell>{log.weight || "—"}</TableCell>
                            <TableCell>{log.water_intake || "—"}</TableCell>
                            <TableCell>{log.activity_minutes || "—"}</TableCell>
                            <TableCell className="max-w-xs truncate">{log.notes || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    Meal Photos
                  </CardTitle>
                  <CardDescription>View client meal photos and logs</CardDescription>
                </CardHeader>
                <CardContent>
                  {mealLogs.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No meal photos yet</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {mealLogs.map((log) => (
                        <div key={log.id} className="space-y-2">
                          <MealPhotoDisplay photoPath={log.photo_url} mealName={log.meal_name} />
                          <div className="text-sm">
                            <p className="font-medium capitalize">{log.meal_type.replace("_", " ")}</p>
                            {log.meal_name && <p className="text-muted-foreground">{log.meal_name}</p>}
                            {log.kcal && <p className="text-muted-foreground">{log.kcal} kcal</p>}
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(log.logged_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="files">
            <Card>
              <CardHeader>
                <CardTitle>Files</CardTitle>
                <CardDescription>Uploaded documents and media</CardDescription>
              </CardHeader>
              <CardContent>
                {files.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No files yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {files.map((file) => (
                        <TableRow key={file.id}>
                          <TableCell>{file.file_name}</TableCell>
                          <TableCell>{file.file_type || "—"}</TableCell>
                          <TableCell>{file.file_size ? `${(file.file_size / 1024).toFixed(2)} KB` : "—"}</TableCell>
                          <TableCell>{formatDate(file.created_at)}</TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const signedUrl = await getSignedUrl("client-files", file.file_url);
                                  window.open(signedUrl, "_blank");
                                } catch (error) {
                                  toast.error("Failed to open file");
                                }
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteFileId(file.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>Weekly Reports</CardTitle>
                <CardDescription>Generated progress reports</CardDescription>
              </CardHeader>
              <CardContent>
                {reports.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No reports yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Week</TableHead>
                        <TableHead>Date Range</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell>Week {report.week_number}</TableCell>
                          <TableCell>
                            {formatDate(report.start_date)} - {formatDate(report.end_date)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{report.summary || "—"}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {report.pdf_url && (
                                <Button variant="outline" size="sm" asChild>
                                  <a href={report.pdf_url} target="_blank" rel="noopener noreferrer">
                                    PDF
                                  </a>
                                </Button>
                              )}
                              {report.audio_url && (
                                <Button variant="outline" size="sm" asChild>
                                  <a href={report.audio_url} target="_blank" rel="noopener noreferrer">
                                    Audio
                                  </a>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages" className="space-y-6">
            {/* Notification diagnostic */}
            {(() => {
              const supported = 'Notification' in window;
              const perm = supported ? Notification.permission : 'unsupported';
              if (perm === 'granted') return null;
              return (
                <div className="p-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">
                      {!supported ? 'Browser does not support notifications' :
                       perm === 'denied' ? 'Notifications BLOCKED. Click lock icon → Notifications → Allow, then refresh.' :
                       'Notifications not enabled. Click to allow →'}
                    </span>
                    {perm === 'default' && (
                      <Button size="sm" variant="outline" className="shrink-0"
                        onClick={() => {
                          Notification.requestPermission().then((p) => {
                            if (p === 'granted') {
                              try { new Notification('Notifications Enabled!', { body: 'You will now receive message alerts.' }); } catch(e) {}
                              window.location.reload();
                            } else { toast.error('Permission denied. Click lock icon in address bar.'); }
                          });
                        }}
                      >Enable Notifications</Button>
                    )}
                  </div>
                </div>
              );
            })()}
            <Card className="h-[600px] flex flex-col overflow-hidden">
              <CardHeader>
                <CardTitle>Messages</CardTitle>
                <CardDescription>Communication with {client.name}</CardDescription>
              </CardHeader>
              <MessageFeed messages={messages} currentUserType={userRole as any} />
              {user && id && (
                <MessageComposer
                  clientId={id}
                  senderId={user.id}
                  senderType={userRole as any}
                  onMessageSent={handleMessageSent}
                />
              )}
            </Card>
          </TabsContent>

          <TabsContent value="calendar">
            {id && <CalendarView clientId={id} />}
          </TabsContent>

          <TabsContent value="workflow">
            {id && <WorkflowTimeline clientId={id} />}

            {id && (
              <div className="mt-6">
                <PendingReviewDashboard
                  clientId={id}
                  onReviewCard={(cardId, cardType) => {
                    setReviewCardId(cardId);
                    setReviewCardType(cardType);
                  }}
                  onSuccess={refetchClientData}
                />
              </div>
            )}

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Assessment Request History</CardTitle>
                <CardDescription>Total requests sent to this client</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col items-center p-4 border rounded-lg">
                    <HeartPulse className="h-8 w-8 text-blue-600 mb-2" />
                    <div className="text-2xl font-bold">{data?.assessmentRequestCounts?.health || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Health</p>
                  </div>
                  <div className="flex flex-col items-center p-4 border rounded-lg">
                    <Brain className="h-8 w-8 text-purple-600 mb-2" />
                    <div className="text-2xl font-bold">{data?.assessmentRequestCounts?.stress || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Stress</p>
                  </div>
                  <div className="flex flex-col items-center p-4 border rounded-lg">
                    <Moon className="h-8 w-8 text-indigo-600 mb-2" />
                    <div className="text-2xl font-bold">{data?.assessmentRequestCounts?.sleep || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Sleep</p>
                  </div>
                  <div className="flex flex-col items-center p-4 border rounded-lg">
                    <FileText className="h-8 w-8 text-orange-600 mb-2" />
                    <div className="text-2xl font-bold">{assessments.filter(a => (a as any).assessment_type === 'custom').length}</div>
                    <p className="text-xs text-muted-foreground mt-1">Comprehensive</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Request Assessments</CardTitle>
                <CardDescription>Send assessment forms to client</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => handleRequestAssessment('health_assessment')}
                  disabled={isRequestingAssessment}
                  className="w-full"
                  variant="outline"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Request Health Assessment
                </Button>

                <Button
                  onClick={() => handleRequestAssessment('stress_assessment')}
                  disabled={isRequestingAssessment}
                  className="w-full"
                  variant="outline"
                >
                  <Brain className="mr-2 h-4 w-4" />
                  Request Stress Assessment
                </Button>

                <Button
                  onClick={() => handleRequestAssessment('sleep_assessment')}
                  disabled={isRequestingAssessment}
                  className="w-full"
                  variant="outline"
                >
                  <Moon className="mr-2 h-4 w-4" />
                  Request Sleep Assessment
                </Button>

                <Button
                  onClick={() => handleRequestAssessment('comprehensive_assessment')}
                  disabled={isRequestingAssessment}
                  className="w-full"
                  variant="outline"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Request Comprehensive Assessment
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {client?.service_type === 'hundred_days' && (
            <TabsContent value="progress">
              {id && <HundredDayProgress clientId={id} />}
            </TabsContent>
          )}
        </Tabs>
      </div>

      <AlertDialog open={!!deleteAssessmentId} onOpenChange={() => setDeleteAssessmentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assessment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this assessment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const assessment = assessments.find(a => a.id === deleteAssessmentId);
                if (assessment) handleDeleteAssessment(assessment.id, assessment.file_url);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletePlanId} onOpenChange={() => setDeletePlanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this plan? All associated meal cards will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletePlanId) handleDeletePlan(deletePlanId);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFileId} onOpenChange={() => setDeleteFileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const file = files.find(f => f.id === deleteFileId);
                if (file) handleDeleteFile(file.id, file.file_url);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditAssessmentDialog
        assessmentId={editAssessmentId}
        open={editAssessmentId !== null}
        onOpenChange={(open) => !open && setEditAssessmentId(null)}
        onSave={() => {
          fetchClientData();
          setEditAssessmentId(null);
        }}
      />

      <ComprehensiveAssessmentForm
        clients={[]}
        initialClientId={id!}
        assessmentId={selectedCustomAssessmentId}
        open={customAssessmentOpen}
        onOpenChange={(open) => {
          setCustomAssessmentOpen(open);
          if (!open) setSelectedCustomAssessmentId(null);
        }}
        onSuccess={refetchClientData}
      />

      <ComprehensiveAssessmentReport
        open={isReportOpen}
        onOpenChange={setIsReportOpen}
        data={selectedReportData}
        clientName={client?.name || ""}
      />

      {reviewCardId && reviewCardType === 'health_assessment' && (
        <HealthAssessmentCardEditor
          cardId={reviewCardId}
          open={!!reviewCardId}
          onOpenChange={(open) => {
            if (!open) {
              setReviewCardId(null);
              setReviewCardType(null);
            }
          }}
          onSave={refetchClientData}
        />
      )}

      {reviewCardId && reviewCardType === 'stress_card' && (
        <StressCardEditor
          cardId={reviewCardId}
          open={!!reviewCardId}
          onOpenChange={(open) => {
            if (!open) {
              setReviewCardId(null);
              setReviewCardType(null);
            }
          }}
          onSave={refetchClientData}
        />
      )}

      {reviewCardId && reviewCardType === 'sleep_card' && (
        <SleepCardEditor
          cardId={reviewCardId}
          open={!!reviewCardId}
          onOpenChange={(open) => {
            if (!open) {
              setReviewCardId(null);
              setReviewCardType(null);
            }
          }}
          onSave={refetchClientData}
        />
      )}
    </div>
  );
};

export default ClientDetail;
