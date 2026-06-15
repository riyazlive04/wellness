import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, keepPreviousData } from "@tanstack/react-query";
import { BrowserRouter, Outlet, Routes, Route } from "react-router-dom";
import { SirahLoader } from "@/design-system";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/theme-provider";
import { InstallPrompt } from "@/components/InstallPrompt";
import {
  RequireClient,
  RequireSuperAdmin,
  RequireWorkspace,
} from "@/components/auth/RequireRole";
import { RequireOnboarded } from "@/components/auth/RequireOnboarded";
import { SuperAdminLayout } from "@/modules/super-admin/SuperAdminLayout";
import { lazy, Suspense } from "react";

// ─── SIRAH LIFE — the only app ─────────────────────────────────────────
const NotFound          = lazy(() => import("./pages/NotFound"));
const Landing           = lazy(() => import("./pages/sirah/Landing"));
const Auth              = lazy(() => import("./pages/sirah/Auth"));
const Onboarding        = lazy(() => import("./pages/sirah/Onboarding"));
const InviteAccept      = lazy(() => import("./pages/sirah/InviteAccept"));
const TeamInviteAccept  = lazy(() => import("./pages/sirah/TeamInviteAccept"));
const Overview          = lazy(() => import("./pages/sirah/owner/Overview"));
const Clients           = lazy(() => import("./pages/sirah/owner/Clients"));
const ClientDetail      = lazy(() => import("./pages/sirah/owner/ClientDetail"));
const Programs          = lazy(() => import("./pages/sirah/owner/Programs"));
const ProgramDetail     = lazy(() => import("./pages/sirah/owner/ProgramDetail"));
const PlateVision       = lazy(() => import("./pages/sirah/owner/PlateVision"));
const VoiceAI           = lazy(() => import("./pages/sirah/owner/VoiceAI"));
const Billing           = lazy(() => import("./pages/sirah/owner/Billing"));
const Subscription      = lazy(() => import("./pages/sirah/owner/Subscription"));
const Messaging         = lazy(() => import("./pages/sirah/owner/Messaging"));
const Collaborate       = lazy(() => import("./pages/sirah/owner/Collaborate"));
const AiEcosystem       = lazy(() => import("./pages/sirah/owner/AiEcosystem"));
const Analytics         = lazy(() => import("./pages/sirah/owner/Analytics"));
const Appointments      = lazy(() => import("./pages/sirah/owner/Appointments"));
const AppointmentDetail = lazy(() => import("./pages/sirah/owner/AppointmentDetail"));
const Team              = lazy(() => import("./pages/sirah/owner/Team"));
const Community         = lazy(() => import("./pages/sirah/owner/Community"));
const Notifications     = lazy(() => import("./pages/sirah/owner/Notifications"));
const OwnerAnnouncements = lazy(() => import("./pages/sirah/owner/Announcements"));
const AIAssistant       = lazy(() => import("./pages/sirah/owner/AIAssistant"));
const Reports           = lazy(() => import("./pages/sirah/owner/Reports"));
const Settings          = lazy(() => import("./pages/sirah/owner/Settings"));
const Automation        = lazy(() => import("./pages/sirah/owner/Automation"));
const ClientHome          = lazy(() => import("./pages/sirah/client/Home"));
const ClientMeals         = lazy(() => import("./pages/sirah/client/Meals"));
const ClientPlateVision   = lazy(() => import("./pages/sirah/client/PlateVision"));
const ClientVoiceAI       = lazy(() => import("./pages/sirah/client/VoiceAI"));
const ClientProgress      = lazy(() => import("./pages/sirah/client/Progress"));
const ClientPrograms      = lazy(() => import("./pages/sirah/client/Programs"));
const ClientChat          = lazy(() => import("./pages/sirah/client/Chat"));
const ClientWellnessAssistant = lazy(() => import("./pages/sirah/client/WellnessAssistant"));
const ClientGoals         = lazy(() => import("./pages/sirah/client/Goals"));
const ClientHabits        = lazy(() => import("./pages/sirah/client/Habits"));
const ClientJournal       = lazy(() => import("./pages/sirah/client/Journal"));
const ClientTimeline      = lazy(() => import("./pages/sirah/client/Timeline"));
const ExecutiveAI         = lazy(() => import("./pages/sirah/admin/ExecutiveAI"));
const ClientAppointments  = lazy(() => import("./pages/sirah/client/Appointments"));
const ClientCommunity     = lazy(() => import("./pages/sirah/client/Community"));
const ClientReports       = lazy(() => import("./pages/sirah/client/Reports"));
const ClientNotifications = lazy(() => import("./pages/sirah/client/Notifications"));
const ClientSettings      = lazy(() => import("./pages/sirah/client/Settings"));
const ClientOnboarding    = lazy(() => import("./pages/sirah/client/Onboarding"));
const ClientMeasurements  = lazy(() => import("./pages/sirah/client/Measurements"));
const ClientAssessments   = lazy(() => import("./pages/sirah/client/Assessments"));
const ClientRecipes       = lazy(() => import("./pages/sirah/client/Recipes"));
const ClientFiles         = lazy(() => import("./pages/sirah/client/Files"));
const ClientWellbeing     = lazy(() => import("./pages/sirah/client/Wellbeing"));
const ClientCycle         = lazy(() => import("./pages/sirah/client/Cycle"));
const ClientPhotos        = lazy(() => import("./pages/sirah/client/Photos"));
const ClientSupplements   = lazy(() => import("./pages/sirah/client/Supplements"));
const ClientFoods         = lazy(() => import("./pages/sirah/client/Foods"));
const OwnerNutritionFoods       = lazy(() => import("./pages/sirah/owner/NutritionFoods"));
const OwnerNutritionFoodDetail  = lazy(() => import("./pages/sirah/owner/NutritionFoodDetail"));
const OwnerNutritionRecipes       = lazy(() => import("./pages/sirah/owner/NutritionRecipes"));
const OwnerNutritionRecipeNew     = lazy(() => import("./pages/sirah/owner/NutritionRecipeNew"));
const OwnerNutritionRecipeDetail  = lazy(() => import("./pages/sirah/owner/NutritionRecipeDetail"));
const OwnerNutritionRecipeEdit    = lazy(() => import("./pages/sirah/owner/NutritionRecipeEdit"));
const OwnerClientWellness       = lazy(() => import("./pages/sirah/owner/ClientWellness"));
const OwnerActivity             = lazy(() => import("./pages/sirah/owner/Activity"));
const OwnerOrganizations        = lazy(() => import("./pages/sirah/owner/Organizations"));
const OwnerOrganizationActivity = lazy(() => import("./pages/sirah/owner/OrganizationActivity"));
const OwnerPlateReview          = lazy(() => import("./pages/sirah/owner/PlateReview"));
import { RealtimeNotificationBridge } from "./modules/activity/RealtimeNotificationBridge";
const AdminOverview      = lazy(() => import("./pages/sirah/admin/AdminOverview"));
const AdminWorkspaces    = lazy(() => import("./pages/sirah/admin/AdminWorkspaces"));
const WorkspaceDetail    = lazy(() => import("./pages/sirah/admin/WorkspaceDetail"));
const AdminUsers         = lazy(() => import("./pages/sirah/admin/AdminUsers"));
const AdminTeam          = lazy(() => import("./pages/sirah/admin/AdminTeam"));
const AdminAudit         = lazy(() => import("./pages/sirah/admin/AdminAudit"));
const AdminAnnouncements = lazy(() => import("./pages/sirah/admin/AdminAnnouncements"));
const AdminConfig        = lazy(() => import("./pages/sirah/admin/AdminConfig"));
const AdminRevenue       = lazy(() => import("./pages/sirah/admin/AdminRevenue"));
const AdminAiUsage       = lazy(() => import("./pages/sirah/admin/AdminAiUsage"));
const AdminSubscriptions = lazy(() => import("./pages/sirah/admin/AdminSubscriptions"));
const AdminBilling       = lazy(() => import("./pages/sirah/admin/AdminBilling"));
const AdminHealth        = lazy(() => import("./pages/sirah/admin/AdminHealth"));
const AdminIntegrations  = lazy(() => import("./pages/sirah/admin/AdminIntegrations"));
const AdminCompliance    = lazy(() => import("./pages/sirah/admin/AdminCompliance"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
      // Keep showing the last successful data while a query refetches on key
      // change (search, filter, pagination) so lists never flash empty — the
      // single biggest perceived-smoothness win across the app.
      placeholderData: keepPreviousData,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark" storageKey="sirah-ui-theme" attribute="class">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <InstallPrompt />
          <AuthProvider>
            <RealtimeNotificationBridge />
            <Suspense fallback={<SirahLoader />}>
              <Routes>
                {/* Public */}
                <Route path="/"              element={<Landing />} />
                <Route path="/auth"          element={<Auth />} />
                <Route path="/onboarding"    element={<Onboarding />} />
                <Route path="/invite/:token" element={<InviteAccept />} />
                <Route path="/team-invite/:token" element={<TeamInviteAccept />} />

                {/* Workspace tier — owners + members + super_admin pass */}
                <Route element={<RequireWorkspace><Outlet /></RequireWorkspace>}>
                  <Route path="/dashboard"        element={<Overview />} />
                  <Route path="/clients"          element={<Clients />} />
                  <Route path="/clients/:id"      element={<ClientDetail />} />
                  <Route path="/programs"         element={<Programs />} />
                  <Route path="/programs/:id"     element={<ProgramDetail />} />
                  <Route path="/appointments"     element={<Appointments />} />
                  <Route path="/appointments/:id" element={<AppointmentDetail />} />
                  <Route path="/messaging"        element={<Messaging />} />
                  <Route path="/collaborate"      element={<Collaborate />} />
                  <Route path="/messaging/:id"    element={<Messaging />} />
                  <Route path="/ai"               element={<AIAssistant />} />
                  <Route path="/ai-ecosystem"     element={<AiEcosystem />} />
                  <Route path="/automation"       element={<Automation />} />
                  <Route path="/analytics"        element={<Analytics />} />
                  <Route path="/community"        element={<Community />} />
                  <Route path="/billing"          element={<Billing />} />
                  <Route path="/subscription"     element={<Subscription />} />
                  <Route path="/team"             element={<Team />} />
                  <Route path="/notifications"    element={<Notifications />} />
                  <Route path="/announcements"    element={<OwnerAnnouncements />} />
                  <Route path="/reports"          element={<Reports />} />
                  <Route path="/settings"         element={<Settings />} />
                  <Route path="/plate-vision"     element={<PlateVision />} />
                  <Route path="/voice"            element={<VoiceAI />} />
                  <Route path="/voice-ai"         element={<VoiceAI />} />
                  <Route path="/dashboard/nutrition/foods"           element={<OwnerNutritionFoods />} />
                  <Route path="/dashboard/nutrition/foods/:id"       element={<OwnerNutritionFoodDetail />} />
                  <Route path="/dashboard/nutrition/recipes"         element={<OwnerNutritionRecipes />} />
                  <Route path="/dashboard/nutrition/recipes/new"     element={<OwnerNutritionRecipeNew />} />
                  <Route path="/dashboard/nutrition/recipes/:id"     element={<OwnerNutritionRecipeDetail />} />
                  <Route path="/dashboard/nutrition/recipes/:id/edit" element={<OwnerNutritionRecipeEdit />} />
                  <Route path="/clients/:id/wellness"                element={<OwnerClientWellness />} />
                  <Route path="/dashboard/activity"                  element={<OwnerActivity />} />
                  <Route path="/dashboard/plate-review"              element={<OwnerPlateReview />} />
                  <Route path="/organizations"                       element={<OwnerOrganizations />} />
                  <Route path="/organizations/activity"              element={<OwnerOrganizationActivity />} />
                </Route>

                {/* Client tier — wellness companion (SIRAH Health / Headspace feel) */}
                <Route element={<RequireClient><Outlet /></RequireClient>}>
                  {/* Onboarding wizard sits OUTSIDE the RequireOnboarded gate
                      so a freshly-accepted invite can actually reach it. */}
                  <Route path="/portal/onboarding"     element={<ClientOnboarding />} />

                  <Route element={<RequireOnboarded><Outlet /></RequireOnboarded>}>
                    <Route path="/portal"                element={<ClientHome />} />
                    <Route path="/portal/meals"          element={<ClientMeals />} />
                    <Route path="/portal/plate-vision"   element={<ClientPlateVision />} />
                    <Route path="/portal/voice"          element={<ClientVoiceAI />} />
                    <Route path="/portal/progress"       element={<ClientProgress />} />
                    <Route path="/portal/programs"       element={<ClientPrograms />} />
                    <Route path="/portal/chat"           element={<ClientChat />} />
                    <Route path="/portal/assistant"      element={<ClientWellnessAssistant />} />
                    <Route path="/portal/goals"          element={<ClientGoals />} />
                    <Route path="/portal/habits"         element={<ClientHabits />} />
                    <Route path="/portal/journal"        element={<ClientJournal />} />
                    <Route path="/portal/timeline"       element={<ClientTimeline />} />
                    <Route path="/portal/appointments"   element={<ClientAppointments />} />
                    <Route path="/portal/community"      element={<ClientCommunity />} />
                    <Route path="/portal/measurements"   element={<ClientMeasurements />} />
                    <Route path="/portal/assessments"    element={<ClientAssessments />} />
                    <Route path="/portal/recipes"        element={<ClientRecipes />} />
                    <Route path="/portal/files"          element={<ClientFiles />} />
                    <Route path="/portal/wellbeing"      element={<ClientWellbeing />} />
                    <Route path="/portal/cycle"          element={<ClientCycle />} />
                    <Route path="/portal/photos"         element={<ClientPhotos />} />
                    <Route path="/portal/supplements"    element={<ClientSupplements />} />
                    <Route path="/portal/foods"          element={<ClientFoods />} />
                    <Route path="/portal/foods/:id"      element={<ClientFoods />} />
                    <Route path="/portal/reports"        element={<ClientReports />} />
                    <Route path="/portal/notifications"  element={<ClientNotifications />} />
                    <Route path="/portal/settings"       element={<ClientSettings />} />
                    <Route path="/me"                    element={<ClientHome />} />
                  </Route>
                </Route>

                {/* Super Admin tier — distinct SuperAdminLayout shell */}
                <Route
                  path="/admin"
                  element={
                    <RequireSuperAdmin>
                      <SuperAdminLayout />
                    </RequireSuperAdmin>
                  }
                >
                  <Route index                       element={<AdminOverview />} />
                  {/* Insights */}
                  <Route path="assistant"            element={<ExecutiveAI />} />
                  <Route path="revenue"              element={<AdminRevenue />} />
                  <Route path="ai-usage"             element={<AdminAiUsage />} />
                  {/* Workspaces & users */}
                  <Route path="workspaces"           element={<AdminWorkspaces />} />
                  <Route path="workspaces/:id"       element={<WorkspaceDetail />} />
                  <Route path="users"                element={<AdminUsers />} />
                  <Route path="subscriptions"        element={<AdminSubscriptions />} />
                  <Route path="billing"              element={<AdminBilling />} />
                  {/* Operations */}
                  <Route path="announcements"        element={<AdminAnnouncements />} />
                  <Route path="audit"                element={<AdminAudit />} />
                  <Route path="health"               element={<AdminHealth />} />
                  <Route path="integrations"         element={<AdminIntegrations />} />
                  <Route path="compliance"           element={<AdminCompliance />} />
                  {/* Configuration */}
                  <Route path="config"               element={<AdminConfig />} />
                  <Route path="team"                 element={<AdminTeam />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
