import { useEffect, useState, lazy, Suspense, useCallback } from "react";
import { ModeToggle } from "@/components/mode-toggle";

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Activity,
  FileText,
  LogOut,
  Eye,
  TrendingUp,
  Calendar
} from "lucide-react";
import { CustomLogo } from "@/components/CustomLogo";
import { AdminClientEditor } from "@/components/AdminClientEditor";
import { CreateManagerDialog } from "@/components/CreateManagerDialog";

// Lazy load tab components for better initial load performance
const FoodItemsManager = lazy(() => import("@/components/FoodItemsManager").then(m => ({ default: m.FoodItemsManager })));
const IngredientsManager = lazy(() => import("@/components/IngredientsManager").then(m => ({ default: m.IngredientsManager })));
const RecipeBuilder = lazy(() => import("@/components/RecipeBuilder").then(m => ({ default: m.RecipeBuilder })));
const InterestSubmissionsManager = lazy(() => import("@/components/InterestSubmissionsManager").then(m => ({ default: m.InterestSubmissionsManager })));
const ReportManager = lazy(() => import("@/components/ReportManager").then(m => ({ default: m.ReportManager })));
const ComprehensiveAssessmentManager = lazy(() => import("@/components/ComprehensiveAssessmentManager").then(m => ({ default: m.ComprehensiveAssessmentManager })));
const ManagersManager = lazy(() => import("@/components/ManagersManager").then(m => ({ default: m.ManagersManager })));
const MessageTemplatesManager = lazy(() => import("@/components/MessageTemplatesManager").then(m => ({ default: m.MessageTemplatesManager })));
import { BulkMessageButton } from "@/components/BulkMessageButton";
import { ComprehensiveAssessmentForm } from "@/components/ComprehensiveAssessmentForm";

import { WorkflowStatusWidget } from "@/components/WorkflowStatusWidget";
import { AdminRequestsWidget } from "@/components/AdminRequestsWidget";
import { PendingReviewDashboard } from "@/components/PendingReviewDashboard";
import { HealthAssessmentCardEditor } from "@/components/HealthAssessmentCardEditor";
import { StressCardEditor } from "@/components/StressCardEditor";
import { SleepCardEditor } from "@/components/SleepCardEditor";
import { formatServiceType, getServiceTypeBadgeColor } from "@/lib/formatters";
import { toast } from "sonner";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, userRole, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [reviewCardId, setReviewCardId] = useState<string | null>(null);
  const [reviewCardType, setReviewCardType] = useState<string | null>(null);
  const [managerDialogOpen, setManagerDialogOpen] = useState(false);

  // Helper: Managers cannot view personal client info
  const canViewClientDetails = userRole === "admin";

  // Auth check handled by ProtectedRoute

  const fetchDashboardData = async () => {
    // Optimize: Run admin roles and today's logs queries in parallel
    const today = new Date().toISOString().split("T")[0];

    const [adminAndManagerRoles, todayLogsResult, pendingCardsResult, adminRequestsResult] = await Promise.all([
      supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "manager"]),
      supabase
        .from("daily_logs")
        .select("*", { count: "exact", head: true })
        .eq("log_date", today),
      supabase
        .from("pending_review_cards")
        .select("id")
        .in("status", ["pending", "edited"]),
      supabase
        .from("admin_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
    ]);

    const adminAndManagerUserIds = adminAndManagerRoles.data?.map((r) => r.user_id) || [];

    // Fetch clients excluding admins and managers
    let query = supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    // Exclude admin and manager user_ids if any exist
    if (adminAndManagerUserIds.length > 0) {
      query = query.not("user_id", "in", `(${adminAndManagerUserIds.join(",")})`);
    }

    const { data: clientsData, error: clientsError } = await query;

    if (clientsError) throw clientsError;

    // Calculate stats
    const activeClients = clientsData?.filter((c) => c.status === "active").length || 0;
    const pendingClientRecords = clientsData?.filter((c) => c.status === "pending").length || 0;
    const pendingReviewCards = pendingCardsResult.data?.length || 0;
    const pendingAdminRequests = adminRequestsResult.count || 0;
    const totalPending = pendingClientRecords + pendingReviewCards + pendingAdminRequests;

    console.log("Dashboard Stats Calculation:", {
      pendingClientRecords,
      pendingReviewCards,
      totalPending
    });

    return {
      clients: clientsData || [],
      stats: {
        totalClients: clientsData?.length || 0,
        activeClients,
        pendingClients: totalPending,
        todayLogs: todayLogsResult.count || 0,
      }
    };
  };

  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: fetchDashboardData,
    enabled: !!user && (userRole === "admin" || userRole === "manager"),
  });

  // Real-time subscription for pending review cards to keep stats in sync
  useEffect(() => {

    const channel = supabase
      .channel('admin-dashboard-pending-sync')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pending_review_cards' },
        () => {
          console.log("Real-time update: pending_review_cards changed, refetching dashboard stats");
          queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['workflow-stats'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const clients = data?.clients || [];
  const stats = data?.stats || {
    totalClients: 0,
    activeClients: 0,
    pendingClients: 0,
    todayLogs: 0,
  };

  const refetchDashboard = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['workflow-stats'] });
    queryClient.invalidateQueries({ queryKey: ['pending-review-cards'] });
  };

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case "active":
        return "bg-wellness-green/20 text-wellness-green";
      case "inactive":
        return "bg-muted text-muted-foreground";
      case "pending":
        return "bg-wellness-amber/20 text-amber-900";
      default:
        return "bg-muted text-muted-foreground";
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  const handleAutoConvert = async (values: any) => {
    try {
      const { name, email, contact, age_gender } = values.personal;

      // Basic parsing for age/gender if in "Age / Gender" format
      let age = "";
      let gender = "";
      if (age_gender && age_gender.includes('/')) {
        const parts = age_gender.split('/');
        age = parts[0].trim();
        gender = parts[1].trim();
      } else if (age_gender) {
        // Fallback for just age or just gender
        const numericAge = parseInt(age_gender);
        if (!isNaN(numericAge)) age = age_gender;
        else gender = age_gender;
      }

      // Create auth user AND client record via Edge Function
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: email,
          password: "Wellness123!", // Default password for guest assessments
          userData: {
            name: name,
            phone: contact,
            age: age,
            gender: gender,
            status: "pending",
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data?.client?.id || null;
    } catch (err: any) {
      console.error("Auto-convert failed:", err);
      toast.error("Failed to create client account: " + err.message);
      return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-wellness-light via-background to-wellness-light/30">
      <div className="container mx-auto p-4 md:p-8 max-w-7xl">


        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <CustomLogo className="w-12 h-12" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold">Welcome {userRole === 'admin' ? 'Admin' : (userRole === 'manager' ? 'Manager' : 'User')}</h1>
                <Badge variant="outline" className={`${userRole === 'admin' ? 'bg-wellness-green/10 text-wellness-green border-wellness-green/20' : 'bg-wellness-mint/10 text-wellness-mint border-wellness-mint/20'}`}>
                  {userRole?.toUpperCase() || "USER"}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Manage your clients and programs (Role: <span className="font-mono text-xs font-bold text-primary">{userRole || "Unknown"}</span>)
                <br />
                <span className="text-[10px] opacity-70">User: {user?.email} | ID: {user?.id?.substring(0, 8)}...</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <ModeToggle />
            {userRole === "admin" && (
              <Button
                variant="outline"
                onClick={() => setManagerDialogOpen(true)}
              >
                <Users className="mr-2 h-4 w-4" />
                Add Manager
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate('/community')}
            >
              <Users className="mr-2 h-4 w-4" />
              Community
            </Button>
            <Button variant="outline" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>


        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="relative overflow-hidden group card-hover border-l-4 border-l-wellness-green animate-fade-in">
            <div className="absolute inset-0 bg-gradient-to-br from-wellness-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
              <div className="p-2 bg-wellness-light rounded-lg">
                <Users className="h-5 w-5 text-wellness-green" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gradient-primary">{stats.totalClients}</div>
              <p className="text-xs text-muted-foreground mt-1">All registered clients</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden group card-hover border-l-4 border-l-wellness-mint animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-wellness-mint/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.activeClients}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently active programs</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden group card-hover border-l-4 border-l-wellness-amber animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-wellness-amber/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <div className="p-2 bg-amber-100 rounded-lg">
                <FileText className="h-5 w-5 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600">{stats.pendingClients}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting attention</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden group card-hover border-l-4 border-l-blue-500 animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Today's Logs</CardTitle>
              <div className="p-2 bg-blue-100 rounded-lg">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.todayLogs}</div>
              <p className="text-xs text-muted-foreground mt-1">Daily tracking updates</p>
            </CardContent>
          </Card>
        </div>


        <div className="mb-8 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-xl font-bold">Action Center</h2>
            <Badge variant="secondary" className="bg-wellness-amber/10 text-wellness-amber border-wellness-amber/20">
              {stats.pendingClients} Total Actions
            </Badge>
          </div>
          <AdminRequestsWidget />
          <WorkflowStatusWidget />
          <PendingReviewDashboard
            onReviewCard={(cardId, cardType) => {
              setReviewCardId(cardId);
              setReviewCardType(cardType);
            }}
            onSuccess={refetchDashboard}
          />
        </div>

        {/* Main Content */}
        <Tabs defaultValue="clients" className="space-y-6">
          <TabsList className="grid w-full h-auto grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 bg-muted/50 p-2">
            <TabsTrigger value="clients" className="h-full">Clients</TabsTrigger>
            <TabsTrigger value="leads" className="h-full">Leads</TabsTrigger>
            <TabsTrigger value="reports" className="h-full">Reports</TabsTrigger>
            <TabsTrigger value="ingredients" className="h-full">Ingredients</TabsTrigger>
            <TabsTrigger value="food" className="h-full">Food Items</TabsTrigger>
            <TabsTrigger value="recipes" className="h-full">Recipes</TabsTrigger>
            <TabsTrigger value="templates" className="h-full">Templates</TabsTrigger>
            {userRole === "admin" && (
              <TabsTrigger value="managers" className="h-full">Managers</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="clients">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>All Clients</CardTitle>
                  <CardDescription>Manage your client roster</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <BulkMessageButton clients={clients} onSuccess={refetchDashboard} />
                  <ComprehensiveAssessmentForm
                    clients={clients}
                    trigger={
                      <Button variant="outline" className="gap-2">
                        <FileText className="h-4 w-4" />
                        Comprehensive Nutritional Assessment Form
                      </Button>
                    }
                    onSuccess={refetchDashboard}
                  />
                  <Button
                    onClick={() => {
                      setEditingClientId(null);
                      setEditorOpen(true);
                    }}
                    className="flex-1 sm:flex-none"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    New Client
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {clients.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground animate-fade-in">
                    <div className="p-6 bg-wellness-light rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                      <Users className="w-12 h-12 text-wellness-green/40" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2 text-foreground">No clients yet</h3>
                    <p className="text-sm mb-6">New clients will appear here once they sign up</p>
                    <Button variant="outline" className="interactive-button" onClick={() => setEditorOpen(true)}>
                      <Users className="mr-2 h-4 w-4" />
                      Add Your First Client
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {clients.map((client, index) => (
                      <Card
                        key={client.id}
                        className="relative overflow-hidden group card-hover border-l-4 border-l-transparent hover:border-l-wellness-green transition-all animate-fade-in"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-wellness-light/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardContent className="p-6 relative">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-wellness-green to-wellness-mint rounded-full flex items-center justify-center text-white font-semibold shadow-md shrink-0">
                                  {client.name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <h3 className="font-semibold text-lg flex flex-wrap items-center gap-2">
                                    <span className="truncate">{client.name}</span>
                                    <Badge className={getStatusColor(client.status)} variant="outline">
                                      {client.status}
                                    </Badge>
                                  </h3>
                                  <p className="text-sm text-muted-foreground truncate">
                                    {userRole === "admin" ? client.email : (userRole === "manager" ? "***@***.com" : "Restricted")}
                                  </p>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <span>📱</span>
                                  <span>{userRole === "admin" ? client.phone : (userRole === "manager" ? "**********" : "Restricted")}</span>
                                </div>
                                <div>
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${(userRole === "admin" || userRole === "manager") ? getServiceTypeBadgeColor(client.service_type) : "bg-muted text-muted-foreground"}`}>
                                    {(userRole === "admin" || userRole === "manager") ? formatServiceType(client.service_type) : "Restricted"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <span>🎯</span>
                                  <span className="capitalize">{(userRole === "admin" || userRole === "manager") ? client.program_type?.replace("_", " ") : "*************"}</span>
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <span>⚖️</span>
                                  <span>{(userRole === "admin" || userRole === "manager") ? (client.last_weight ? `${client.last_weight} kg` : "Not set") : "** kg"}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 sm:ml-4 w-full sm:w-auto mt-2 sm:mt-0">
                              <Button
                                variant="outline"
                                size="sm"
                                className="interactive-button flex-1 sm:flex-none"
                                onClick={() => {
                                  setEditingClientId(client.id);
                                  setEditorOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="interactive-button group/btn flex-1 sm:flex-none"
                                onClick={() => navigate(`/admin/client/${client.id}`)}
                              >
                                <Eye className="mr-2 h-4 w-4 transition-transform group-hover/btn:scale-110" />
                                View
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-pulse text-lg">Loading...</div></div>}>
              <InterestSubmissionsManager clients={clients} />
            </Suspense>
          </TabsContent>

          <TabsContent value="templates">
            <Suspense fallback={<div className="text-center py-12">Loading templates...</div>}>
              <MessageTemplatesManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="ingredients">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-pulse text-lg">Loading...</div></div>}>
              <IngredientsManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="food">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-pulse text-lg">Loading...</div></div>}>
              <FoodItemsManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="recipes">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-pulse text-lg">Loading...</div></div>}>
              <RecipeBuilder />
            </Suspense>
          </TabsContent>

          <TabsContent value="reports">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-pulse text-lg">Loading...</div></div>}>
              <div className="space-y-12">
                <ComprehensiveAssessmentManager />
                <div className="pt-8 border-t">
                  <ReportManager />
                </div>
              </div>
            </Suspense>
          </TabsContent>

          {userRole === "admin" && (
            <TabsContent value="managers">
              <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-pulse text-lg">Loading...</div></div>}>
                <ManagersManager />
              </Suspense>
            </TabsContent>
          )}


        </Tabs>

        <CreateManagerDialog
          open={managerDialogOpen}
          onOpenChange={setManagerDialogOpen}
          onSuccess={() => {
            toast.success("Manager created successfully");
            refetchDashboard();
          }}
        />

        <AdminClientEditor
          clientId={editingClientId}
          open={editorOpen}
          onOpenChange={(open) => {
            setEditorOpen(open);
            if (!open) setEditingClientId(null);
          }}
          onSuccess={(newClientId?: string | null) => {
            refetchDashboard();
            if (newClientId && !editingClientId) {
              // Only redirect if it was a new client creation
              navigate(`/onboarding?clientId=${newClientId}`);
            }
          }}
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
            onSave={refetchDashboard}
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
            onSave={refetchDashboard}
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
            onSave={refetchDashboard}
          />
        )}

      </div>
    </div>
  );
}