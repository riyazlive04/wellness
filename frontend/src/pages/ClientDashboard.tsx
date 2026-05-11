import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Scale,
  Droplets,
  Activity,
  Flame,
  LogOut,
  FileText,
  Plus,
  HelpCircle,
  AlertCircle,
  Image as ImageIcon,
  X,
  Eye
} from "lucide-react";
import { CustomLogo } from "@/components/CustomLogo";
import { MealPhotoUpload } from "@/components/MealPhotoUpload";
import { ComprehensiveAssessmentForm } from "@/components/ComprehensiveAssessmentForm";
import { FileUploadSection } from "@/components/FileUploadSection";
import { WeeklyPlanViewer } from "@/components/WeeklyPlanViewer";
import { ProgressCharts } from "@/components/ProgressCharts";
import { formatServiceType, getServiceTypeBadgeColor, formatDate, formatDateTime } from "@/lib/formatters";
import { MotivationCard } from "@/components/MotivationCard";
import { WeeklyGoals } from "@/components/WeeklyGoals";
import { getSignedUrls } from "@/lib/storage";
import { getFileIcon, getFileDisplayName, handleFileClick } from "@/lib/fileUtils";
import { AchievementList } from "@/components/AchievementList";
import { AchievementProgress } from "@/components/AchievementProgress";
import { AchievementNotification } from "@/components/AchievementNotification";
import { MessageFeed } from "@/components/MessageFeed";
import { MessageComposer } from "@/components/MessageComposer";
import { MessageNotification } from "@/components/MessageNotification";
import { sendAutomatedMessage, getUnreadCount, markMessagesAsRead, type Message } from "@/lib/messages";
import { MessageCircle, BellOff } from "lucide-react";
import { CalendarView } from "@/components/CalendarView";
import { HundredDayProgress } from "@/components/HundredDayProgress";
import { UpcomingMeetingsBanner } from "@/components/UpcomingMeetingsBanner";
import { NotificationBell } from "@/components/NotificationBell";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { HealthAssessmentCardView } from "@/components/client/HealthAssessmentCardView";
import { StressCardView } from "@/components/client/StressCardView";
import { SleepCardView } from "@/components/client/SleepCardView";
import { ActionPlanCardView } from "@/components/client/ActionPlanCardView";
import { DietPlanCardView } from "@/components/client/DietPlanCardView";
import { ClipboardList } from "lucide-react";
import { PendingAssessmentRequests } from "@/components/PendingAssessmentRequests";
import { ClientReportList } from "@/components/ClientReportList";
import { ClientComprehensiveReportList } from "@/components/ClientComprehensiveReportList";
import { NotificationSettings } from "@/components/NotificationSettings";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import { ClientRecipeList } from "@/components/client/ClientRecipeList";
import { ClientHealthAssessmentForm } from "@/components/client/ClientHealthAssessmentForm";
import { ClientStressAssessmentForm } from "@/components/client/ClientStressAssessmentForm";
import { ClientSleepAssessmentForm } from "@/components/client/ClientSleepAssessmentForm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ModeToggle } from "@/components/mode-toggle";
import { Textarea } from "@/components/ui/textarea"; // Ensure this is imported or use Input as fallback

import { ClientMeasurementTracker } from "@/components/client/ClientMeasurementTracker"; // Add import

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

export default function ClientDashboard() {
  const navigate = useNavigate();
  const { user, userRole, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [todayLog, setTodayLog] = useState<any>(null);
  const [mealLogs, setMealLogs] = useState<any[]>([]);
  const [todayCalories, setTodayCalories] = useState(0);
  const [activeTab, setActiveTab] = useState<"today" | "plan" | "logs" | "files" | "achievements" | "assessments" | "reports" | "messages" | "calendar" | "progress" | "measurements">("today");
  const [assessmentCards, setAssessmentCards] = useState<any[]>([]);
  const [assessmentRecords, setAssessmentRecords] = useState<any[]>([]);
  const [newCardNotification, setNewCardNotification] = useState<any>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [weightInput, setWeightInput] = useState<string>("");
  const [waterInput, setWaterInput] = useState<string>("");
  const [activityInput, setActivityInput] = useState<string>("");
  const [activityType, setActivityType] = useState<string>("");
  const [achievements, setAchievements] = useState<any[]>([]);
  const [userAchievements, setUserAchievements] = useState<any[]>([]);
  const [achievementProgress, setAchievementProgress] = useState<any[]>([]);
  const [newAchievements, setNewAchievements] = useState<any[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newMessage, setNewMessage] = useState<Message | null>(null);

  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [selectedAssessmentRequest, setSelectedAssessmentRequest] = useState<{ requestId: string; type: string } | null>(null);

  // Urgent Query State
  const [showUrgentQuery, setShowUrgentQuery] = useState(false);
  const [urgentQueryText, setUrgentQueryText] = useState("");
  const [sendingQuery, setSendingQuery] = useState(false);
  const [urgentQueryImage, setUrgentQueryImage] = useState<File | null>(null);
  const [urgentQueryImagePreview, setUrgentQueryImagePreview] = useState<string | null>(null);

  const [selectedReportCard, setSelectedReportCard] = useState<any>(null);

  const fetchClientData = async () => {
    if (!user?.id) throw new Error("No user");

    // Fetch client data
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (clientError) {
      console.error("Error fetching client:", clientError);
      throw clientError;
    }

    if (!client) {
      // Return null, the component's useEffect will handle redirection if needed
      return null;
    }

    if (!client?.id) {
      throw new Error("Client record missing ID");
    }

    // Fetch user achievements (Earned & Progress are combined in the new schema)
    // We use user.id directly since user_achievements is linked to auth.users
    const { data: earned } = await supabase
      .from("user_achievements")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_unlocked", true)
      .order("unlocked_at", { ascending: false }) as any;

    // Fetch achievement progress
    // In the new schema, any record in user_achievements tracks progress
    const { data: progress } = await supabase
      .from("user_achievements")
      .select("*")
      .eq("user_id", user.id) as any;

    // Fetch client files
    const { data: files } = await supabase
      .from("files")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    // Fetch today's log
    const todayDate = new Date().toISOString().split("T")[0];
    const { data: log } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("client_id", client.id)
      .eq("log_date", todayDate)
      .maybeSingle();

    // Fetch meal logs
    const { data: meals } = await supabase
      .from("meal_logs")
      .select("*")
      .eq("client_id", client.id)
      .order("logged_at", { ascending: false })
      .limit(55);

    // Calculate today's calories
    const todayMeals = meals?.filter(
      (meal) => meal.logged_at.split("T")[0] === todayDate
    ) || [];
    const totalCalories = todayMeals.reduce((sum, meal) => sum + (meal.kcal || 0), 0);

    return {
      client,
      earned: (earned || []).map(e => ({
        ...e,
        earned_at: e.unlocked_at // Map new column to old prop name
      })),
      progress: progress || [],
      log,
      meals: meals || [],
      todayCalories: totalCalories,
      files: files || []
    };
  };

  const { data, isLoading } = useQuery({
    queryKey: ['client-dashboard', user?.id],
    queryFn: fetchClientData,
    enabled: !!user?.id,
  });

  const clientData = data?.client || null;

  const { isSupported: pushSupported, isSubscribed, isLoading: pushLoading, permissionStatus, subscribe, unsubscribe } = usePushNotifications(clientData?.id || null);

  // Auth check handled by ProtectedRoute

  useEffect(() => {
    if (data) {
      setTodayLog(data.log);
      setMealLogs(data.meals);
      setTodayCalories(data.todayCalories);
      setUserAchievements(data.earned);
      setAchievementProgress(data.progress);
      if (data.log?.activity_type) {
        setActivityType(data.log.activity_type);
      }
    } else if (!isLoading && !data && user?.id) {
      // If data is null and we are not loading, it means no client record was found
      // Check effective role (context or metadata)
      const effectiveRole = userRole || (user.user_metadata?.role as "admin" | "client" | "manager" | null);
      const isStaff = effectiveRole === "admin" || effectiveRole === "manager";

      if (isStaff) {
        console.log("[ClientDashboard] Staff member detected via effective role, redirecting to admin");
        navigate("/admin");
      } else if (effectiveRole === "client") {
        console.log("[ClientDashboard] No client record found for client, redirecting to onboarding");
        navigate("/onboarding");
      } else {
        // If still no role, wait for AuthContext to definitively resolve it
        console.log("[ClientDashboard] Role still undetermined, waiting...");
      }
    }
  }, [data, isLoading, userRole, user, navigate]);

  // Auto-request notification permission when dashboard loads
  useEffect(() => {
    if (!clientData?.id) return;
    if ('Notification' in window && Notification.permission === 'default') {
      // Small delay so it doesn't interfere with page load
      const timer = setTimeout(() => {
        Notification.requestPermission().then((perm) => {
          console.log('[Notify] Auto-permission result:', perm);
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [clientData?.id]);

  // Cross-tab notification listener is in main.tsx (runs at app startup, no dependencies)

  // Real-time messages subscription
  useEffect(() => {
    if (!clientData?.id) return;

    fetchMessages();
    updateUnreadCount();

    const channel = supabase
      .channel('messages-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `client_id=eq.${clientData.id}`
      }, (payload) => {

        const newMsg = payload.new as Message;
        setMessages(prev => [...prev, newMsg]);
        setNewMessage(newMsg);
        setUnreadCount(prev => prev + 1);

        // Show native browser notification for messages from admin/manager/system
        if (newMsg.sender_type && newMsg.sender_type !== 'client') {
          showBrowserNotification(
            'New Message from your Nutritionist',
            newMsg.content?.slice(0, 100) || 'You have a new message',
            '/dashboard?tab=messages'
          );
        }
      })
      .subscribe((status) => {

      });

    return () => {

      supabase.removeChannel(channel);
    };
  }, [clientData?.id]);

  // Real-time assessment cards subscription
  useEffect(() => {
    if (!clientData?.id) return;

    fetchAssessmentCards();

    const channel = supabase
      .channel('assessment-cards-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'pending_review_cards',
        filter: `client_id=eq.${clientData.id}`
      }, (payload) => {
        const updatedCard = payload.new as any;
        if (updatedCard.status === 'sent') {
          setNewCardNotification(updatedCard);
          fetchAssessmentCards();
          const cardLabel = (updatedCard.card_type || 'assessment').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          toast.success(`New ${cardLabel} card received!`);

          // Show browser notification
          showBrowserNotification(
            `New ${cardLabel} Card`,
            `Your nutritionist has sent your ${cardLabel} card. View your results now!`,
            '/dashboard'
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientData?.id]);

  // Real-time weekly plan subscription
  useEffect(() => {
    if (!clientData?.id) return;

    const channel = supabase
      .channel('weekly-plans-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'weekly_plans',
        filter: `client_id=eq.${clientData.id}`
      }, (payload) => {
        const plan = payload.new as any;
        if (payload.eventType === 'INSERT' || (payload.eventType === 'UPDATE' && plan?.status === 'published')) {
          toast.success('Your nutritionist has published a new weekly plan!');
          showBrowserNotification(
            'New Weekly Plan Published',
            'Your latest nutrition and meal plan is ready to view!',
            '/dashboard?tab=diet_plan'
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientData?.id]);

  const fetchAssessmentCards = async () => {
    if (!clientData?.id) return;

    const { data, error } = await supabase
      .from('pending_review_cards')
      .select('*')
      .eq('client_id', clientData.id)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false });

    if (!error && data) {
      setAssessmentCards(data);
    }

    // Fetch actual assessment records for editing
    const { data: assessments, error: assessError } = await supabase
      .from('assessments')
      .select('*')
      .eq('client_id', clientData.id)
      .not('form_responses', 'is', null);

    if (!assessError && assessments) {
      setAssessmentRecords(assessments);
    }
  };

  useEffect(() => {
    const fetchAchievementsData = async () => {
      const { data: allAchievements } = await supabase
        .from("achievements")
        .select("*")
        .order("target_value", { ascending: true });

      if (allAchievements) {
        setAchievements(allAchievements);
      }
    };

    fetchAchievementsData();
  }, []);

  const refetchClientData = () => {
    queryClient.invalidateQueries({ queryKey: ['client-dashboard', user?.id] });
  };

  const fetchMessages = async () => {
    if (!clientData?.id) return;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('client_id', clientData.id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data as Message[]);
    }
  };

  const updateUnreadCount = async () => {
    if (!clientData?.id) return;
    const count = await getUnreadCount(clientData.id, 'client');
    setUnreadCount(count);
  };

  const handleMessagesTabOpen = async () => {
    setActiveTab('messages');
    if (clientData?.id) {
      await markMessagesAsRead(clientData.id, 'client');
      setUnreadCount(0);
    }
  };

  const fetchClientDataLegacy = async () => {
    // This is kept for compatibility with meal photo upload callbacks
    refetchClientData();
  };

  // Load signed URLs for meal photos
  useEffect(() => {
    const loadSignedUrls = async () => {
      const paths = mealLogs
        .map(log => log.photo_url)
        .filter(Boolean) as string[];

      if (paths.length === 0) return;

      try {
        const urlMap = await getSignedUrls("meal-photos", paths);
        setSignedUrls(Object.fromEntries(urlMap));
      } catch (error) {
        console.error("Error loading signed URLs:", error);
      }
    };

    loadSignedUrls();
  }, [mealLogs]);

  const quickAddWater = async (amount: number) => {
    if (!clientData) return;
    if (!amount || isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase.rpc('log_daily_metric', {
        p_client_id: clientData.id,
        p_metric_type: 'water',
        p_value: amount,
        p_date: today
      });

      if (error) throw error;

      setTodayLog(data);
      toast.success(`Added ${amount}ml water`);
      setWaterInput("");
      refetchClientData();

      // Check for achievements
      if (clientData?.id) {
        checkAchievements(clientData.id, "water_log");
      }
    } catch (error: any) {
      console.error("Error adding water:", error);
      toast.error(error.message || "Failed to add water");
    }
  };

  const quickAddActivity = async (minutes: number) => {
    if (!clientData) return;
    if (!minutes || isNaN(minutes) || minutes <= 0) {
      toast.error("Please enter a valid duration");
      return;
    }

    try {
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase.rpc('log_daily_metric', {
        p_client_id: clientData.id,
        p_metric_type: 'activity',
        p_value: minutes,
        p_date: today
      });

      if (error) throw error;

      setTodayLog(data);
      toast.success(`Added ${minutes} minutes`);
      setActivityInput("");
      refetchClientData();

      // Send automated message based on new total
      const newTotal = (Number(todayLog?.activity_minutes) || 0) + minutes;

      if (newTotal >= 30) {
        await sendAutomatedMessage(clientData.id, 'activity_milestone_30', {
          name: clientData.name,
          minutes: newTotal
        });
      } else {
        await sendAutomatedMessage(clientData.id, 'activity_logged', {
          name: clientData.name,
          minutes
        });
      }

      // Check for achievements
      if (clientData?.id) {
        checkAchievements(clientData.id, "activity_log");
      }
    } catch (error) {
      console.error("Error adding activity:", error);
      toast.error("Failed to add activity");
    }
  };

  const logWeight = async (weight: number) => {
    if (!clientData) return;
    if (!weight || isNaN(weight) || weight <= 0) {
      toast.error("Please enter a valid weight");
      return;
    }

    try {
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase.rpc('log_daily_metric', {
        p_client_id: clientData.id,
        p_metric_type: 'weight',
        p_value: weight,
        p_date: today
      });

      if (error) throw error;

      setTodayLog(data);
      toast.success(`Weight logged: ${weight} kg`);
      refetchClientData();

      // Send automated message
      const previousWeight = clientData.last_weight || weight;
      const weightDiff = previousWeight - weight;

      if (weightDiff > 0) {
        await sendAutomatedMessage(clientData.id, 'weight_logged_loss', {
          name: clientData.name,
          weight,
          diff: weightDiff.toFixed(1)
        });
      } else if (weightDiff === 0) {
        await sendAutomatedMessage(clientData.id, 'weight_logged_maintain', {
          name: clientData.name,
          weight
        });
      } else {
        await sendAutomatedMessage(clientData.id, 'weight_logged_positive', {
          name: clientData.name,
          weight
        });
      }

      // Check for achievements
      checkAchievements(clientData.id, "weight_log");
    } catch (error) {
      console.error("Error logging weight:", error);
      toast.error("Failed to log weight");
    }
  };

  const checkAchievements = async (clientId: string, actionType: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("check-achievements", {
        body: { client_id: clientId, action_type: actionType },
      });

      if (error) {
        console.error("Error checking achievements:", error);
        return;
      }

      if (data?.newAchievements && data.newAchievements.length > 0) {
        setNewAchievements(data.newAchievements);
        // Refresh achievement data
        refetchClientData();
      }

      if (data?.updatedProgress) {
        setAchievementProgress(data.updatedProgress);
      }
    } catch (error) {
      console.error("Error checking achievements:", error);
    }
  };

  const requestMealUpdate = async (mealId: string, mealName: string | null) => {
    if (!clientData?.id) return;

    try {
      const { error } = await supabase
        .from('admin_requests')
        .insert({
          client_id: clientData.id,
          request_type: 'meal_update',
          metadata: { meal_id: mealId, meal_name: mealName || 'Unnamed Meal' },
          status: 'pending'
        });

      if (error) throw error;
      toast.success("Request sent to admin");
    } catch (error) {
      console.error("Error sending request:", error);
      toast.error("Failed to send request");
    }
  };

  const handleUrgentQuerySubmit = async () => {
    if (!clientData?.id) {
      toast.error("You must be registered as a client to send urgent queries.");
      return;
    }

    if (!urgentQueryText.trim()) {
      toast.error("Please enter your question");
      return;
    }

    try {
      setSendingQuery(true);

      let imagePath = null;
      if (urgentQueryImage) {
        // Use client ID as root folder to satisfy RLS policies
        const fileName = `${clientData.id}/urgent-queries/${Date.now()}-${urgentQueryImage.name}`;
        const { error: uploadError } = await supabase.storage
          .from("meal-photos")
          .upload(fileName, urgentQueryImage);

        if (uploadError) throw uploadError;
        imagePath = fileName;
      }

      const { data: insertData, error } = await supabase
        .from('admin_requests')
        .insert({
          client_id: clientData.id,
          request_type: 'urgent_query',
          metadata: {
            message: urgentQueryText.trim(),
            image_path: imagePath
          },
          status: 'pending',
          admin_notes: null
        })
        .select();

      if (error) {
        console.error("Error inserting urgent query:", error);
        throw error;
      }

      console.log("Urgent query inserted successfully:", insertData);

      toast.success("Urgent query sent to admin");
      setShowUrgentQuery(false);
      setUrgentQueryText("");
      setUrgentQueryImage(null);
      setUrgentQueryImagePreview(null);
    } catch (error) {
      console.error("Error sending urgent query:", error);
      toast.error("Failed to send query");
    } finally {
      setSendingQuery(false);
    }
  };

  const handleUrgentImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size must be less than 5MB");
        return;
      }
      setUrgentQueryImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setUrgentQueryImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNavigateToCalendar = (date: Date) => {
    setActiveTab('calendar');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-wellness-light via-background to-wellness-light/30">
      <div className="container mx-auto p-4 md:p-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <CustomLogo className="w-12 h-12 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold truncate">Welcome, {clientData?.name}!</h1>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm sm:text-base text-muted-foreground truncate">Your wellness dashboard</p>
                {clientData?.service_type && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs border ${getServiceTypeBadgeColor(clientData.service_type)}`}>
                    {formatServiceType(clientData.service_type)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <ModeToggle />
            <NotificationBell 
              clientId={clientData?.id || ''} 
              onNavigate={(tab) => setActiveTab(tab as any)} 
            />
            {pushSupported && !isSubscribed && permissionStatus !== 'denied' && (
              <Button variant="default" onClick={subscribe} disabled={pushLoading} size="sm" className="bg-primary hover:bg-primary/90 flex-1 sm:flex-none">
                Enable Notifications
              </Button>
            )}
            {pushSupported && permissionStatus === 'denied' && (
              <Button variant="outline" size="sm" onClick={() => setActiveTab('today')} className="text-muted-foreground flex-1 sm:flex-none">
                <BellOff className="h-4 w-4 mr-2" />
                Blocked
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate('/community')}
              className="flex-1 sm:flex-none"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Community
            </Button>
            <Button variant="outline" onClick={signOut} className="flex-1 sm:flex-none">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Motivation Card */}
        <MotivationCard />

        {/* Upcoming Meetings Banner */}
        {clientData?.id && (
          <UpcomingMeetingsBanner
            clientId={clientData.id}
            onNavigate={handleNavigateToCalendar}
          />
        )}

        {/* Enhanced Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
          {/* Weight Card */}
          <Card className="card-hover">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Weight</CardTitle>
                <Scale className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-2">
                {todayLog?.weight ? `${todayLog.weight} kg` : "--"}
              </div>
              {clientData?.last_weight && todayLog?.weight && (
                <p className="text-xs text-muted-foreground">
                  {todayLog.weight < clientData.last_weight ? "↓" : "↑"}
                  {Math.abs(todayLog.weight - clientData.last_weight).toFixed(1)} kg from last
                </p>
              )}
            </CardContent>
          </Card>

          {/* Water Card */}
          <Card className="card-hover">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Water</CardTitle>
                <Droplets className="h-4 w-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-2">
                {todayLog?.water_intake || 0}
                <span className="text-lg text-muted-foreground"> / 2000ml</span>
              </div>
              <Progress
                value={Math.min(((todayLog?.water_intake || 0) / 2000) * 100, 100)}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {Math.round(((todayLog?.water_intake || 0) / 2000) * 100)}% of daily goal
              </p>
            </CardContent>
          </Card>

          {/* Activity Card */}
          <Card className="card-hover">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Activity</CardTitle>
                <Activity className="h-4 w-4 text-orange-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-2">
                {todayLog?.activity_minutes || 0}
                <span className="text-lg text-muted-foreground"> / 30 min</span>
              </div>
              <Progress
                value={Math.min(((todayLog?.activity_minutes || 0) / 30) * 100, 100)}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {Math.round(((todayLog?.activity_minutes || 0) / 30) * 100)}% of daily goal
              </p>
            </CardContent>
          </Card>

          {/* Calories Card */}
          <Card className="card-hover">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Calories</CardTitle>
                <Flame className="h-4 w-4 text-red-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-2">
                {todayCalories}
                <span className="text-lg text-muted-foreground"> / {clientData?.target_kcal || "--"}</span>
              </div>
              {clientData?.target_kcal && (
                <>
                  <Progress
                    value={Math.min((todayCalories / clientData.target_kcal) * 100, 100)}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    {Math.round((todayCalories / clientData.target_kcal) * 100)}% of daily goal
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as typeof activeTab)}
          className=""
        >
          <div className="tabs-container flex items-center justify-center gap-2 flex-wrap p-1 rounded-lg bg-muted/50 overflow-x-auto">
            <TabsList className="flex flex-wrap h-auto justify-center gap-2 bg-transparent p-0 w-full sm:w-auto">
              <TabsTrigger value="today" className="flex-1 sm:flex-none whitespace-nowrap">Today</TabsTrigger>
              <TabsTrigger value="measurements" className="flex-1 sm:flex-none whitespace-nowrap">Measurements</TabsTrigger>
              <TabsTrigger value="plan" className="flex-1 sm:flex-none whitespace-nowrap">Plan</TabsTrigger>
              <TabsTrigger value="logs" className="flex-1 sm:flex-none whitespace-nowrap">Meals</TabsTrigger>
              <TabsTrigger value="files" className="flex-1 sm:flex-none whitespace-nowrap">Files</TabsTrigger>
              <TabsTrigger value="achievements" className="flex-1 sm:flex-none whitespace-nowrap">Achievements</TabsTrigger>
              <TabsTrigger value="assessments" className="flex-1 sm:flex-none relative whitespace-nowrap">
                <ClipboardList className="w-4 h-4 mr-1 hidden sm:inline-block" />
                <span className="sm:inline">Assessments</span>
                {assessmentCards.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {assessmentCards.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="reports" className="flex-1 sm:flex-none whitespace-nowrap">Reports</TabsTrigger>
              <TabsTrigger value="messages" className="flex-1 sm:flex-none relative whitespace-nowrap" onClick={handleMessagesTabOpen}>
                Messages
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="calendar" className="flex-1 sm:flex-none whitespace-nowrap">Calendar</TabsTrigger>
              <TabsTrigger value="recipes" className="flex-1 sm:flex-none whitespace-nowrap">Recipes</TabsTrigger>
              {clientData?.service_type === 'hundred_days' && (
                <TabsTrigger value="progress" className="flex-1 sm:flex-none whitespace-nowrap">100-Day</TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="today" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Quick Actions Column */}
              <div className="lg:col-span-2 space-y-6">
                {/* Pending Assessment Requests */}
                {clientData?.id && (
                  <PendingAssessmentRequests
                    clientId={clientData.id}
                    onStartAssessment={(requestId, type) => {
                      setSelectedAssessmentRequest({ requestId, type });
                      setShowAssessmentForm(true);
                    }}
                  />
                )}

                <Card className="animate-fade-in">
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>Log your daily activities</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Water Quick Add */}
                    <div>
                      <Label className="mb-2 block">Add Water</Label>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => quickAddWater(250)}
                          className="w-full"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          250ml
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => quickAddWater(500)}
                          className="w-full"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          500ml
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => quickAddWater(750)}
                          className="w-full"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          750ml
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="50"
                          min="50"
                          max="2000"
                          placeholder="Custom amount (ml)"
                          value={waterInput}
                          onChange={(e) => setWaterInput(e.target.value)}
                          className="flex-1"
                          onlyNumbers
                        />
                        <Button
                          variant="default"
                          onClick={() => {
                            const amount = parseInt(waterInput);
                            if (isNaN(amount) || amount < 50 || amount > 2000) {
                              toast.error("Please enter a valid amount (50-2000ml)");
                              return;
                            }
                            quickAddWater(amount);
                          }}
                          className="min-w-[100px]"
                        >
                          <Droplets className="mr-2 h-4 w-4" />
                          Add
                        </Button>
                      </div>
                    </div>

                    {/* Activity Quick Add */}
                    <div>
                      <Label className="mb-2 block">Log Activity</Label>
                      <div className="mb-3">
                        <Select value={activityType} onValueChange={setActivityType}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select activity type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Aerobic">Aerobic</SelectItem>
                            <SelectItem value="Muscle Strength">Muscle Strength</SelectItem>
                            <SelectItem value="Flexibility">Flexibility</SelectItem>
                            <SelectItem value="Stretch">Stretch</SelectItem>
                            <SelectItem value="Lifestyle">Lifestyle</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => quickAddActivity(15)}
                          className="flex-1 min-w-[100px]"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          15 min
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => quickAddActivity(30)}
                          className="flex-1 min-w-[100px]"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          30 min
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => quickAddActivity(60)}
                          className="flex-1 min-w-[100px]"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          60 min
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="5"
                          min="5"
                          max="300"
                          placeholder="Custom minutes"
                          value={activityInput}
                          onChange={(e) => setActivityInput(e.target.value)}
                          className="flex-1"
                          onlyNumbers
                        />
                        <Button
                          variant="default"
                          onClick={() => {
                            const minutes = parseInt(activityInput);
                            if (isNaN(minutes) || minutes < 5 || minutes > 300) {
                              toast.error("Please enter valid minutes (5-300)");
                              return;
                            }
                            quickAddActivity(minutes);
                          }}
                          className="min-w-[100px]"
                        >
                          <Activity className="mr-2 h-4 w-4" />
                          Log
                        </Button>
                      </div>
                    </div>

                    {/* Weight Logging */}
                    <div className="mb-4">
                      <Label className="mb-2 block">Log Weight</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.1"
                          min="20"
                          max="300"
                          placeholder="Enter weight in kg"
                          value={weightInput}
                          onChange={(e) => setWeightInput(e.target.value)}
                          className="flex-1"
                          onlyNumbers
                        />
                        <Button
                          onClick={() => {
                            const weight = parseFloat(weightInput);
                            if (!isNaN(weight) && weight >= 20 && weight <= 300) {
                              logWeight(weight);
                              setWeightInput("");
                            } else {
                              toast.error("Please enter a valid weight (20-300 kg)");
                            }
                          }}
                          disabled={!weightInput}
                        >
                          <Scale className="mr-2 h-4 w-4" />
                          Log
                        </Button>
                      </div>
                    </div>

                    {/* Meal Logging */}
                    <div className="pt-4 border-t">
                      {clientData?.id && (
                        <MealPhotoUpload
                          clientId={clientData.id}
                          onSuccess={() => {
                            refetchClientData();
                            checkAchievements(clientData.id, "meal_log");
                          }}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <ProgressCharts clientId={clientData?.id} daysToShow={14} />
              </div>

              {/* Weekly Goals & Achievements Column */}
              <div className="space-y-6">
                <WeeklyGoals clientId={clientData?.id} />

                <Card className="animate-fade-in">
                  <CardHeader>
                    <CardTitle>Achievement Progress</CardTitle>
                    <CardDescription>You're almost there!</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AchievementProgress
                      achievements={achievements}
                      progress={achievementProgress}
                    />
                  </CardContent>
                </Card>

                <Card className="animate-fade-in">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Today's Meals</CardTitle>
                        <CardDescription>Track your nutrition</CardDescription>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowUrgentQuery(true)}
                        className="animate-pulse"
                      >
                        <AlertCircle className="mr-2 h-4 w-4" />
                        Ask Admin / Urgent
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" onClick={() => setActiveTab("logs")}>
                      <Plus className="mr-2 h-4 w-4" />
                      Log Meal Photo
                    </Button>
                  </CardContent>
                </Card>

                <NotificationSettings clientId={clientData?.id || null} />
              </div>
            </div>
          </TabsContent>


          <TabsContent value="measurements" className="space-y-6">
            {clientData?.id && <ClientMeasurementTracker clientId={clientData.id} />}
          </TabsContent>

          <TabsContent value="plan">
            {clientData && <WeeklyPlanViewer clientId={clientData.id} />}
          </TabsContent>

          <TabsContent value="logs">
            <div className="space-y-6">
              {clientData?.id ? (
                <MealPhotoUpload
                  clientId={clientData.id}
                  onSuccess={() => {
                    refetchClientData();
                    checkAchievements(clientData.id, "meal_log");
                  }}
                />
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Loading your meal logging form...
                  </CardContent>
                </Card>
              )}

              {mealLogs.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Your Meal History</CardTitle>
                    <CardDescription>Recent meals you've logged</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {mealLogs.map((log) => {
                        const signedUrl = log.photo_url ? signedUrls[log.photo_url] : null;
                        const isImage = log.file_type?.startsWith('image/');
                        const FileIcon = getFileIcon(log.file_type);

                        return (
                          <div key={log.id} className="flex gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                            {signedUrl && (
                              <div className="w-24 h-24 flex-shrink-0">
                                {isImage ? (
                                  <img
                                    src={signedUrl}
                                    alt={log.meal_name || "Meal"}
                                    className="w-full h-full object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => handleFileClick(signedUrl, log.file_type, log.meal_name || undefined)}
                                  />
                                ) : (
                                  <div
                                    className="w-full h-full flex flex-col items-center justify-center bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                                    onClick={() => handleFileClick(signedUrl, log.file_type, log.meal_name || undefined)}
                                  >
                                    <FileIcon className="h-8 w-8 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground mt-1">
                                      {getFileDisplayName(log.file_type)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1 gap-2">
                                <p className="font-semibold capitalize">{log.meal_type.replace("_", " ")}</p>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm text-muted-foreground whitespace-nowrap">
                                    {formatDateTime(log.logged_at)}
                                  </p>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => requestMealUpdate(log.id, log.meal_name)}
                                    title="Request help/update"
                                  >
                                    <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                  </Button>
                                </div>
                              </div>
                              {log.meal_name && <p className="text-sm truncate">{log.meal_name}</p>}
                              {log.kcal && <p className="text-sm text-muted-foreground">{log.kcal} kcal</p>}
                              {log.notes && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{log.notes}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="files">
            {clientData && <FileUploadSection clientId={clientData.id} />}
          </TabsContent>

          <TabsContent value="achievements">
            <AchievementList
              achievements={achievements}
              earnedAchievements={userAchievements}
              progress={achievementProgress}
            />
          </TabsContent>

          <TabsContent value="assessments">
            <div className="space-y-6">
              {assessmentCards.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
                    <p className="text-lg mb-2 font-medium">No Assessment Cards Yet</p>
                    <p className="text-sm text-muted-foreground">
                      Your personalized assessment cards will appear here once reviewed and sent by your dietitian
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {assessmentCards.map((card) => {
                    const isNew = card.sent_at && new Date(card.sent_at) > new Date(Date.now() - 24 * 60 * 60 * 1000);

                    return (
                      <div key={card.id} className="space-y-4">
                        <div
                          className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedReportCard(card)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.card_type === 'health_assessment' ? 'bg-primary/10' :
                              card.card_type === 'stress_card' ? 'bg-purple-500/10' :
                                card.card_type === 'sleep_card' ? 'bg-blue-500/10' :
                                  card.card_type === 'action_plan' ? 'bg-orange-500/10' :
                                    'bg-green-500/10'
                              }`}>
                              <ClipboardList className={`w-5 h-5 ${card.card_type === 'health_assessment' ? 'text-primary' :
                                card.card_type === 'stress_card' ? 'text-purple-600' :
                                  card.card_type === 'sleep_card' ? 'text-blue-600' :
                                    card.card_type === 'action_plan' ? 'text-orange-600' :
                                      'text-green-600'
                                }`} />
                            </div>
                            <div>
                              <h3 className="font-semibold capitalize flex items-center gap-2">
                                {card.card_type.replace(/_/g, ' ')}
                                {isNew && <Badge variant="default" className="text-xs">NEW</Badge>}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Sent {formatDate(card.sent_at)}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedReportCard(card)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Report
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          <Dialog open={!!selectedReportCard} onOpenChange={(open) => !open && setSelectedReportCard(null)}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0 border-none bg-transparent shadow-none">
              {selectedReportCard && (
                <div className="animate-in fade-in zoom-in duration-200">
                  {selectedReportCard.card_type === 'health_assessment' && (
                    <HealthAssessmentCardView
                      data={selectedReportCard.generated_content}
                      assessmentId={assessmentRecords.find(a => a.assessment_type === 'health' && a.client_id === clientData?.id)?.id}
                      attachedFiles={data?.files || []}
                    />
                  )}
                  {selectedReportCard.card_type === 'stress_card' && (
                    <StressCardView
                      data={selectedReportCard.generated_content}
                      assessmentId={assessmentRecords.find(a => a.assessment_type === 'stress' && a.client_id === clientData?.id)?.id}
                    />
                  )}
                  {selectedReportCard.card_type === 'sleep_card' && (
                    <SleepCardView
                      data={selectedReportCard.generated_content}
                      assessmentId={assessmentRecords.find(a => a.assessment_type === 'sleep' && a.client_id === clientData?.id)?.id}
                      attachedFiles={data?.files || []}
                    />
                  )}
                  {selectedReportCard.card_type === 'action_plan' && (
                    <ActionPlanCardView data={selectedReportCard.generated_content} />
                  )}
                  {selectedReportCard.card_type === 'diet_plan' && (
                    <DietPlanCardView data={selectedReportCard.generated_content} />
                  )}
                  <div className="absolute top-4 right-4 z-50">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedReportCard(null)}
                      className="rounded-full bg-white/20 hover:bg-white/40 text-white border border-white/30 backdrop-blur-sm"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>Your Reports</CardTitle>
                <CardDescription>View your progress and comprehensive assessments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-10">
                {clientData?.id ? (
                  <>
                    <ClientComprehensiveReportList clientId={clientData.id} />
                    <div className="pt-8 border-t">
                      <h3 className="text-lg font-bold mb-4">Weekly Progress Reports</h3>
                      <ClientReportList clientId={clientData.id} />
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>Loading reports...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages">
            {/* Notification diagnostic banner */}
            {(() => {
              const notifSupported = 'Notification' in window;
              const permission = notifSupported ? Notification.permission : 'unsupported';
              const swReady = 'serviceWorker' in navigator;

              if (permission === 'granted') return null; // All good, hide banner

              return (
                <div className="mb-3 p-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm">
                      {!notifSupported ? (
                        <span className="text-red-600 font-medium">Browser does not support notifications</span>
                      ) : permission === 'denied' ? (
                        <span className="text-red-600 font-medium">
                          Notifications are BLOCKED. Click the lock icon in the address bar → Notifications → Allow, then refresh.
                        </span>
                      ) : (
                        <span className="text-yellow-700 dark:text-yellow-300 font-medium">
                          Notifications not enabled yet. Click the button to allow →
                        </span>
                      )}
                    </div>
                    {permission === 'default' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-yellow-400 text-yellow-700 hover:bg-yellow-100"
                        onClick={() => {
                          Notification.requestPermission().then((p) => {
                            if (p === 'granted') {
                              try { new Notification('Notifications Enabled!', { body: 'You will now receive message alerts.' }); } catch(e) {}
                              window.location.reload();
                            } else {
                              toast.error('Permission denied. Click the lock icon in address bar to change.');
                            }
                          });
                        }}
                      >
                        Enable Notifications
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="h-[600px] flex flex-col">
              <Card className="flex-1 flex flex-col overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5" />
                    Messages
                  </CardTitle>
                  <CardDescription>Chat with your nutritionist and receive updates</CardDescription>
                </CardHeader>
                <MessageFeed
                  messages={messages}
                  currentUserType="client"
                  onStartAssessment={(requestId, type) => {
                    setSelectedAssessmentRequest({ requestId, type });
                    setShowAssessmentForm(true);
                  }}
                />
                {clientData && user && (
                  <MessageComposer
                    clientId={clientData.id}
                    senderId={user.id}
                    senderType="client"
                    onMessageSent={fetchMessages}
                  />
                )}
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="calendar" className="-mt-1">
            {clientData?.id && <CalendarView clientId={clientData.id} />}
          </TabsContent>

          {clientData?.service_type === 'hundred_days' && (
            <TabsContent value="progress">
              {clientData?.id && <HundredDayProgress clientId={clientData.id} />}
            </TabsContent>
          )}

          <TabsContent value="recipes">
            <ClientRecipeList />
          </TabsContent>
        </Tabs>

        {/* Achievement Notifications */}
        <AchievementNotification
          newAchievements={newAchievements}
          onDismiss={() => setNewAchievements([])}
        />

        {/* Message Notification */}
        <MessageNotification
          message={newMessage}
          onClose={() => setNewMessage(null)}
          onOpen={handleMessagesTabOpen}
        />

        {/* Push Notification Prompt */}
        <NotificationPrompt clientId={clientData?.id || null} />

        {/* Assessment Form Dialog */}
        <Dialog open={showAssessmentForm} onOpenChange={setShowAssessmentForm}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedAssessmentRequest?.type === 'health_assessment' && clientData && (
              <ClientHealthAssessmentForm
                requestId={selectedAssessmentRequest.requestId}
                clientId={clientData.id}
                clientName={clientData.name}
                onComplete={() => {
                  setShowAssessmentForm(false);
                  toast.success('Assessment submitted! Your results will be ready shortly.');
                }}
              />
            )}
            {selectedAssessmentRequest?.type === 'stress_assessment' && clientData && (
              <ClientStressAssessmentForm
                requestId={selectedAssessmentRequest.requestId}
                clientId={clientData.id}
                clientName={clientData.name}
                onComplete={() => {
                  setShowAssessmentForm(false);
                  toast.success('Assessment submitted! Your results will be ready shortly.');
                }}
              />
            )}
            {selectedAssessmentRequest?.type === 'sleep_assessment' && clientData && (
              <ClientSleepAssessmentForm
                requestId={selectedAssessmentRequest.requestId}
                clientId={clientData.id}
                clientName={clientData.name}
                onComplete={() => {
                  setShowAssessmentForm(false);
                  toast.success('Assessment submitted! Your results will be ready shortly.');
                }}
              />
            )}
            {selectedAssessmentRequest?.type === 'comprehensive_assessment' && clientData && (
              <ComprehensiveAssessmentForm
                clients={[]}
                initialClientId={clientData.id}
                open={showAssessmentForm}
                onOpenChange={setShowAssessmentForm}
                onSuccess={() => {
                  setShowAssessmentForm(false);
                  toast.success('Comprehensive assessment submitted!');
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Urgent Query Dialog */}
        <Dialog open={showUrgentQuery} onOpenChange={setShowUrgentQuery}>
          <DialogContent>
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-red-600 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Urgent Food Query
              </CardTitle>
              <CardDescription>
                Use this for immediate questions about food approvals or urgent diet concerns.
              </CardDescription>
            </CardHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Your Question</Label>
                <Textarea
                  placeholder="e.g., Can I eat the grilled chicken at this restaurant?"
                  value={urgentQueryText}
                  onChange={(e) => setUrgentQueryText(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Attach Photo (Optional)</Label>
                {urgentQueryImagePreview ? (
                  <div className="relative inline-block mt-2">
                    <img
                      src={urgentQueryImagePreview}
                      alt="Preview"
                      className="h-32 w-auto object-cover rounded-md border"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                      onClick={() => {
                        setUrgentQueryImage(null);
                        setUrgentQueryImagePreview(null);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleUrgentImageSelect}
                      className="hidden"
                      id="urgent-query-image"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('urgent-query-image')?.click()}
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Select Image
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowUrgentQuery(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={handleUrgentQuerySubmit}
                  disabled={sendingQuery || !urgentQueryText.trim()}
                >
                  {sendingQuery ? "Sending..." : "Send Urgent Query"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}