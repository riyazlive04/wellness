import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { SuperAdminLayout } from "@/modules/super-admin/SuperAdminLayout";
import { lazy, Suspense } from "react";

// ─── SIRAH LIFE — the only app ─────────────────────────────────────────
const NotFound          = lazy(() => import("./pages/NotFound"));
const Landing           = lazy(() => import("./pages/sirah/Landing"));
const Auth              = lazy(() => import("./pages/sirah/Auth"));
const Onboarding        = lazy(() => import("./pages/sirah/Onboarding"));
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
const Analytics         = lazy(() => import("./pages/sirah/owner/Analytics"));
const Appointments      = lazy(() => import("./pages/sirah/owner/Appointments"));
const AppointmentDetail = lazy(() => import("./pages/sirah/owner/AppointmentDetail"));
const Team              = lazy(() => import("./pages/sirah/owner/Team"));
const Community         = lazy(() => import("./pages/sirah/owner/Community"));
const Notifications     = lazy(() => import("./pages/sirah/owner/Notifications"));
const AIAssistant       = lazy(() => import("./pages/sirah/owner/AIAssistant"));
const Reports           = lazy(() => import("./pages/sirah/owner/Reports"));
const Settings          = lazy(() => import("./pages/sirah/owner/Settings"));
const Automation        = lazy(() => import("./pages/sirah/owner/Automation"));
const ClientHome        = lazy(() => import("./pages/sirah/client/Home"));
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
            <Suspense fallback={<SirahLoader />}>
              <Routes>
                {/* Public */}
                <Route path="/"              element={<Landing />} />
                <Route path="/auth"          element={<Auth />} />
                <Route path="/onboarding"    element={<Onboarding />} />

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
                  <Route path="/messaging/:id"    element={<Messaging />} />
                  <Route path="/ai"               element={<AIAssistant />} />
                  <Route path="/automation"       element={<Automation />} />
                  <Route path="/analytics"        element={<Analytics />} />
                  <Route path="/community"        element={<Community />} />
                  <Route path="/billing"          element={<Billing />} />
                  <Route path="/subscription"     element={<Subscription />} />
                  <Route path="/team"             element={<Team />} />
                  <Route path="/notifications"    element={<Notifications />} />
                  <Route path="/reports"          element={<Reports />} />
                  <Route path="/settings"         element={<Settings />} />
                  <Route path="/plate-vision"     element={<PlateVision />} />
                  <Route path="/voice"            element={<VoiceAI />} />
                  <Route path="/voice-ai"         element={<VoiceAI />} />
                </Route>

                {/* Client tier */}
                <Route element={<RequireClient><Outlet /></RequireClient>}>
                  <Route path="/portal"           element={<ClientHome />} />
                  <Route path="/me"               element={<ClientHome />} />
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
