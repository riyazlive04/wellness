import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, keepPreviousData } from "@tanstack/react-query";
import { BrowserRouter, Outlet, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { SirahLoader } from "@/design-system";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/theme-provider";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";
import { isReservedPublicSlug } from "@/lib/reservedPublicSlugs";
import {
  RequireRole,
  RequireClient,
  RequireSuperAdmin,
  RequireWorkspace,
} from "@/components/auth/RequireRole";
import { RequireOnboarded } from "@/components/auth/RequireOnboarded";
import { RequireApproved } from "@/components/auth/RequireApproved";
import { RequireWorkspaceOwner } from "@/components/auth/RequireWorkspaceOwner";
import { RequirePermission } from "@/components/auth/RequirePermission";
import { SuperAdminLayout } from "@/modules/super-admin/SuperAdminLayout";
import { Suspense, useEffect } from "react";
import { lazyWithPreload, warmRoutesDuringIdle } from "./lib/lazyWithPreload";

// ─── SIRAH LIFE — the only app ─────────────────────────────────────────
const NotFound          = lazyWithPreload(() => import("./pages/NotFound"));
const Landing           = lazyWithPreload(() => import("./pages/sirah/Landing"));
const Auth              = lazyWithPreload(() => import("./pages/sirah/Auth"));
const ResetPassword     = lazyWithPreload(() => import("./pages/sirah/ResetPassword"));
const Onboarding        = lazyWithPreload(() => import("./pages/sirah/Onboarding"));
const Join              = lazyWithPreload(() => import("./pages/sirah/Join"));
const PublicProfile     = lazyWithPreload(() => import("./pages/sirah/PublicProfile"));
const PendingApproval   = lazyWithPreload(() => import("./pages/sirah/portal/PendingApproval"));
const TeamInviteAccept  = lazyWithPreload(() => import("./pages/sirah/TeamInviteAccept"));
const Overview          = lazyWithPreload(() => import("./pages/sirah/owner/Overview"));
const Clients           = lazyWithPreload(() => import("./pages/sirah/owner/Clients"));
const ClientDetail      = lazyWithPreload(() => import("./pages/sirah/owner/ClientDetail"));
const Programs          = lazyWithPreload(() => import("./pages/sirah/owner/Programs"));
const ProgramDetail     = lazyWithPreload(() => import("./pages/sirah/owner/ProgramDetail"));
const OwnerProducts     = lazyWithPreload(() => import("./pages/sirah/owner/Products"));
const OwnerAssessments  = lazyWithPreload(() => import("./pages/sirah/owner/AssessmentForms"));
const OwnerAssessmentBuilder = lazyWithPreload(() => import("./pages/sirah/owner/AssessmentFormBuilder"));
const PlateVision       = lazyWithPreload(() => import("./pages/sirah/owner/PlateVision"));
const VoiceAI           = lazyWithPreload(() => import("./pages/sirah/owner/VoiceAI"));
const Billing           = lazyWithPreload(() => import("./pages/sirah/owner/Billing"));
const Messaging         = lazyWithPreload(() => import("./pages/sirah/owner/Messaging"));
const Collaborate       = lazyWithPreload(() => import("./pages/sirah/owner/Collaborate"));
const Analytics         = lazyWithPreload(() => import("./pages/sirah/owner/Analytics"));
const Appointments      = lazyWithPreload(() => import("./pages/sirah/owner/Appointments"));
const AppointmentDetail = lazyWithPreload(() => import("./pages/sirah/owner/AppointmentDetail"));
const MeetingRoom       = lazyWithPreload(() => import("./pages/sirah/MeetingRoom"));
const Team              = lazyWithPreload(() => import("./pages/sirah/owner/Team"));
const Community         = lazyWithPreload(() => import("./pages/sirah/owner/Community"));
const Notifications     = lazyWithPreload(() => import("./pages/sirah/owner/Notifications"));
const AIAssistant       = lazyWithPreload(() => import("./pages/sirah/owner/AIAssistant"));
const Reports           = lazyWithPreload(() => import("./pages/sirah/owner/Reports"));
const Settings          = lazyWithPreload(() => import("./pages/sirah/owner/Settings"));
const Automation        = lazyWithPreload(() => import("./pages/sirah/owner/Automation"));
const ClientHome          = lazyWithPreload(() => import("./pages/sirah/client/Home"));
const ClientMeals         = lazyWithPreload(() => import("./pages/sirah/client/Meals"));
const ClientMealPlan      = lazyWithPreload(() => import("./pages/sirah/client/MealPlan"));
const ClientPlateVision   = lazyWithPreload(() => import("./pages/sirah/client/PlateVision"));
const ClientProgress      = lazyWithPreload(() => import("./pages/sirah/client/Progress"));
const ClientPrograms      = lazyWithPreload(() => import("./pages/sirah/client/Programs"));
const ClientProgramDetail = lazyWithPreload(() => import("./pages/sirah/client/ProgramDetail"));
const ClientChat          = lazyWithPreload(() => import("./pages/sirah/client/Chat"));
const ClientWellnessAssistant = lazyWithPreload(() => import("./pages/sirah/client/WellnessAssistant"));
const ClientGoals         = lazyWithPreload(() => import("./pages/sirah/client/Goals"));
const ClientHabits        = lazyWithPreload(() => import("./pages/sirah/client/Habits"));
const ClientJournal       = lazyWithPreload(() => import("./pages/sirah/client/Journal"));
const ClientTimeline      = lazyWithPreload(() => import("./pages/sirah/client/Timeline"));
const ExecutiveAI         = lazyWithPreload(() => import("./pages/sirah/admin/ExecutiveAI"));
const ClientAppointments  = lazyWithPreload(() => import("./pages/sirah/client/Appointments"));
const ClientCommunity     = lazyWithPreload(() => import("./pages/sirah/client/Community"));
const ClientReports       = lazyWithPreload(() => import("./pages/sirah/client/Reports"));
const ClientNotifications = lazyWithPreload(() => import("./pages/sirah/client/Notifications"));
const ClientSettings      = lazyWithPreload(() => import("./pages/sirah/client/Settings"));
const ClientOnboarding    = lazyWithPreload(() => import("./pages/sirah/client/Onboarding"));
const ClientMeasurements  = lazyWithPreload(() => import("./pages/sirah/client/Measurements"));
const ClientAssessments   = lazyWithPreload(() => import("./pages/sirah/client/Assessments"));
const ClientRecipes       = lazyWithPreload(() => import("./pages/sirah/client/Recipes"));
const ClientShop          = lazyWithPreload(() => import("./pages/sirah/client/Shop"));
const ClientFiles         = lazyWithPreload(() => import("./pages/sirah/client/Files"));
const ClientWellbeing     = lazyWithPreload(() => import("./pages/sirah/client/Wellbeing"));
const ClientCycle         = lazyWithPreload(() => import("./pages/sirah/client/Cycle"));
const ClientPhotos        = lazyWithPreload(() => import("./pages/sirah/client/Photos"));
const ClientSupplements   = lazyWithPreload(() => import("./pages/sirah/client/Supplements"));
const ClientFoods         = lazyWithPreload(() => import("./pages/sirah/client/Foods"));
const OwnerNutritionFoods       = lazyWithPreload(() => import("./pages/sirah/owner/NutritionFoods"));
const OwnerNutritionFoodDetail  = lazyWithPreload(() => import("./pages/sirah/owner/NutritionFoodDetail"));
const OwnerNutritionRecipes       = lazyWithPreload(() => import("./pages/sirah/owner/NutritionRecipes"));
const OwnerNutritionRecipeNew     = lazyWithPreload(() => import("./pages/sirah/owner/NutritionRecipeNew"));
const OwnerNutritionRecipeDetail  = lazyWithPreload(() => import("./pages/sirah/owner/NutritionRecipeDetail"));
const OwnerNutritionRecipeEdit    = lazyWithPreload(() => import("./pages/sirah/owner/NutritionRecipeEdit"));
const OwnerClientWellness       = lazyWithPreload(() => import("./pages/sirah/owner/ClientWellness"));
const OwnerActivity             = lazyWithPreload(() => import("./pages/sirah/owner/Activity"));
const OwnerOrganizations        = lazyWithPreload(() => import("./pages/sirah/owner/Organizations"));
const OwnerOrganizationActivity = lazyWithPreload(() => import("./pages/sirah/owner/OrganizationActivity"));
const OwnerOrganizationDashboard = lazyWithPreload(() => import("./pages/sirah/owner/OrganizationDashboard"));
const OwnerPlateReview          = lazyWithPreload(() => import("./pages/sirah/owner/PlateReview"));
import { RealtimeNotificationBridge } from "./modules/activity/RealtimeNotificationBridge";
const AdminOverview      = lazyWithPreload(() => import("./pages/sirah/admin/AdminOverview"));
const AdminWorkspaces    = lazyWithPreload(() => import("./pages/sirah/admin/AdminWorkspaces"));
const WorkspaceDetail    = lazyWithPreload(() => import("./pages/sirah/admin/WorkspaceDetail"));
const AdminUsers         = lazyWithPreload(() => import("./pages/sirah/admin/AdminUsers"));
const AdminTeam          = lazyWithPreload(() => import("./pages/sirah/admin/AdminTeam"));
const AdminAudit         = lazyWithPreload(() => import("./pages/sirah/admin/AdminAudit"));
const AdminAnnouncements = lazyWithPreload(() => import("./pages/sirah/admin/AdminAnnouncements"));
const AdminConfig        = lazyWithPreload(() => import("./pages/sirah/admin/AdminConfig"));
const AdminVerifications = lazyWithPreload(() => import("./pages/sirah/admin/AdminVerifications"));
const AdminRevenue       = lazyWithPreload(() => import("./pages/sirah/admin/AdminRevenue"));
const AdminAiUsage       = lazyWithPreload(() => import("./pages/sirah/admin/AdminAiUsage"));
const AdminSubscriptions = lazyWithPreload(() => import("./pages/sirah/admin/AdminSubscriptions"));
const AdminBilling       = lazyWithPreload(() => import("./pages/sirah/admin/AdminBilling"));
const AdminHealth        = lazyWithPreload(() => import("./pages/sirah/admin/AdminHealth"));
const AdminIntegrations  = lazyWithPreload(() => import("./pages/sirah/admin/AdminIntegrations"));
const AdminCompliance    = lazyWithPreload(() => import("./pages/sirah/admin/AdminCompliance"));
const AdminPrivacyPolicy = lazyWithPreload(() => import("./pages/sirah/admin/AdminPrivacyPolicy"));

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

// ── Route prefetch ──────────────────────────────────────────────────────
// Warm the chunks for the sections a signed-in user is most likely to open
// next, during idle time, so navigation is instant (no Suspense fallback flash).
// Split by shell + guarded so we only warm the relevant set, once.
const OWNER_WARM = [
  Overview, Clients, ClientDetail, Programs, ProgramDetail, OwnerAssessments,
  OwnerAssessmentBuilder, Messaging, Collaborate, Appointments, Analytics,
  Automation, Community, Settings, Team, Billing,
  Notifications, PlateVision, AIAssistant, OwnerNutritionFoods, OwnerNutritionRecipes,
];
const CLIENT_WARM = [
  ClientHome, ClientMeals, ClientProgress, ClientPrograms, ClientChat,
  ClientGoals, ClientHabits, ClientJournal, ClientTimeline, ClientAppointments,
  ClientCommunity, ClientMeasurements, ClientAssessments, ClientRecipes,
  ClientWellbeing, ClientSettings,
];
let warmedOwner = false;
let warmedClient = false;

/** Root /:slug bios — skip reserved app segments so they never steal real routes. */
function PublicProfileBySlug() {
  const { slug } = useParams<{ slug: string }>();
  if (isReservedPublicSlug(slug)) return <Navigate to="/" replace />;
  return <PublicProfile />;
}

/** Keep old /p/:slug links working. */
function RedirectLegacyPublicProfile() {
  const { slug = '' } = useParams<{ slug: string }>();
  return <Navigate to={`/${slug}`} replace />;
}

function RoutePrefetcher() {
  const { pathname } = useLocation();
  useEffect(() => {
    const isPublic =
      pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/reset') ||
      pathname.startsWith('/join') || pathname.startsWith('/team-invite') ||
      pathname.startsWith('/p/') ||
      pathname === '/portal/onboarding' || pathname === '/portal/pending' ||
      (/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname) && !isReservedPublicSlug(pathname.slice(1)));
    if (isPublic) return;
    // Prefetch only in production: there, chunks are pre-built so warming is a
    // cheap network fetch. In dev it would force on-demand compilation of every
    // route at once and bog down the dev server, so skip it.
    if (!import.meta.env.PROD) return;
    if (pathname.startsWith('/portal')) {
      if (warmedClient) return;
      warmedClient = true;
      warmRoutesDuringIdle(CLIENT_WARM);
    } else {
      if (warmedOwner) return;
      warmedOwner = true;
      warmRoutesDuringIdle(OWNER_WARM);
    }
  }, [pathname]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark" storageKey="sirah-ui-theme" attribute="class">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <InstallPrompt />
          <RoutePrefetcher />
          <AuthProvider>
            <RealtimeNotificationBridge />
            <ChunkErrorBoundary>
             <Suspense fallback={<SirahLoader />}>
              <Routes>
                {/* Public */}
                <Route path="/"              element={<Landing />} />
                <Route path="/auth"          element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                {/* Only users without a workspace yet should see onboarding.
                    Owners/clients/admins are bounced to their tier home so a
                    completed account never gets stuck on the setup wizard. */}
                <Route path="/onboarding"    element={<RequireRole allow={['unaffiliated']}><Onboarding /></RequireRole>} />
                <Route path="/join/:token" element={<Join />} />
                {/* Legacy /p/:slug → clean /:slug */}
                <Route path="/p/:slug" element={<RedirectLegacyPublicProfile />} />
                <Route path="/team-invite/:token" element={<TeamInviteAccept />} />

                {/* Workspace tier - owners + members + super_admin pass */}
                <Route element={<RequireWorkspace><Outlet /></RequireWorkspace>}>
                  <Route path="/dashboard"        element={<Overview />} />
                  <Route path="/clients"          element={<Clients />} />
                  <Route path="/clients/:id"      element={<ClientDetail />} />
                  <Route path="/clients/:id/:tab" element={<ClientDetail />} />
                  <Route path="/programs"         element={<Programs />} />
                  <Route path="/programs/:id"     element={<ProgramDetail />} />
                  <Route path="/products"         element={<OwnerProducts />} />
                  <Route path="/assessments"      element={<OwnerAssessments />} />
                  <Route path="/assessments/new"  element={<OwnerAssessmentBuilder />} />
                  <Route path="/assessments/:id/edit" element={<OwnerAssessmentBuilder />} />
                  <Route path="/appointments"     element={<Appointments />} />
                  <Route path="/appointments/:id" element={<AppointmentDetail />} />
                  <Route path="/appointments/:id/meet" element={<MeetingRoom side="owner" />} />
                  <Route path="/messaging"        element={<Messaging />} />
                  <Route path="/collaborate"      element={<Collaborate />} />
                  <Route path="/messaging/:id"    element={<Messaging />} />
                  <Route path="/ai"               element={<AIAssistant />} />
                  <Route path="/automation"       element={<Automation />} />
                  <Route path="/analytics"        element={<Analytics />} />
                  <Route path="/community"        element={<Community />} />
                  <Route path="/billing"          element={<RequirePermission perm="billing.manage"><Billing /></RequirePermission>} />
                  {/* Subscription merged into Billing (Plans & usage tab). Redirect keeps old links/bookmarks working. */}
                  <Route path="/subscription"     element={<Navigate to="/billing" replace />} />
                  <Route path="/team"             element={<RequirePermission perm="team.manage"><Team /></RequirePermission>} />
                  <Route path="/notifications"    element={<Notifications />} />
                  <Route path="/reports"          element={<Reports />} />
                  <Route path="/settings"         element={<Settings />} />
                  {/* Privacy policy merged into Billing (Privacy policy tab). Redirect keeps old links/bookmarks working. */}
                  <Route path="/privacy-policy"   element={<Navigate to="/billing?tab=privacy" replace />} />
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
                  <Route path="/organizations"                       element={<RequireWorkspaceOwner><OwnerOrganizations /></RequireWorkspaceOwner>} />
                  <Route path="/organizations/dashboard"             element={<RequireWorkspaceOwner><OwnerOrganizationDashboard /></RequireWorkspaceOwner>} />
                  <Route path="/organizations/activity"              element={<OwnerOrganizationActivity />} />
                </Route>

                {/* Client tier - wellness companion (SIRAH LIFE Health / Headspace feel) */}
                <Route element={<RequireClient><Outlet /></RequireClient>}>
                  {/* The waiting screen sits OUTSIDE RequireApproved, or an
                      unapproved client would be redirected to it forever. */}
                  <Route path="/portal/pending"       element={<PendingApproval />} />

                  <Route element={<RequireApproved><Outlet /></RequireApproved>}>
                  {/* Onboarding wizard sits OUTSIDE the RequireOnboarded gate
                      so a freshly-approved client can actually reach it. */}
                  <Route path="/portal/onboarding"     element={<ClientOnboarding />} />

                  <Route element={<RequireOnboarded><Outlet /></RequireOnboarded>}>
                    <Route path="/portal"                element={<ClientHome />} />
                    <Route path="/portal/meals"          element={<ClientMeals />} />
                    <Route path="/portal/meal-plan"      element={<ClientMealPlan />} />
                    <Route path="/portal/plate-vision"   element={<ClientPlateVision />} />
                    <Route path="/portal/progress"       element={<ClientProgress />} />
                    <Route path="/portal/programs"       element={<ClientPrograms />} />
                    <Route path="/portal/programs/:id"   element={<ClientProgramDetail />} />
                    <Route path="/portal/chat"           element={<ClientChat />} />
                    <Route path="/portal/assistant"      element={<ClientWellnessAssistant />} />
                    <Route path="/portal/goals"          element={<ClientGoals />} />
                    <Route path="/portal/habits"         element={<ClientHabits />} />
                    <Route path="/portal/journal"        element={<ClientJournal />} />
                    <Route path="/portal/timeline"       element={<ClientTimeline />} />
                    <Route path="/portal/appointments"   element={<ClientAppointments />} />
                    <Route path="/portal/appointments/:id/meet" element={<MeetingRoom side="client" />} />
                    <Route path="/portal/community"      element={<ClientCommunity />} />
                    <Route path="/portal/measurements"   element={<ClientMeasurements />} />
                    <Route path="/portal/assessments"    element={<ClientAssessments />} />
                    <Route path="/portal/recipes"        element={<ClientRecipes />} />
                    <Route path="/portal/shop"           element={<ClientShop />} />
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
                </Route>

                {/* Super Admin tier - distinct SuperAdminLayout shell */}
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
                  <Route path="verifications"        element={<AdminVerifications />} />
                  <Route path="privacy"              element={<AdminPrivacyPolicy />} />
                  {/* Configuration */}
                  <Route path="config"               element={<AdminConfig />} />
                  <Route path="team"                 element={<AdminTeam />} />
                </Route>

                {/* Public nutritionist bio at /:slug (after all fixed app routes) */}
                <Route path="/:slug" element={<PublicProfileBySlug />} />

                {/* Fallback */}
                <Route path="*" element={<NotFound />} />
              </Routes>
             </Suspense>
            </ChunkErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
