import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { lazy, Suspense } from "react";
import Home from "./pages/Home";
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const ClientDashboard = lazy(() => import("./pages/ClientDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const SetupAdmin = lazy(() => import("./pages/SetupAdmin"));
const InterestForm = lazy(() => import("./pages/InterestForm"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminEditSleepAssessment = lazy(() => import("./pages/AdminEditSleepAssessment"));
const AdminEditStressAssessment = lazy(() => import("./pages/AdminEditStressAssessment"));
const AdminEditHealthAssessment = lazy(() => import("./pages/AdminEditHealthAssessment"));
const ClientEditSleepForm = lazy(() => import("./components/client/ClientEditSleepForm"));
const ClientEditStressForm = lazy(() => import("./components/client/ClientEditStressForm"));
const ClientEditHealthForm = lazy(() => import("./components/client/ClientEditHealthForm"));
const Community = lazy(() => import("./pages/Community"));
const SupabaseConnectionTest = lazy(() => import("./components/SupabaseConnectionTest"));
const DatabaseConnectionTest = lazy(() => import("./components/DatabaseConnectionTest").then(m => ({ default: m.DatabaseConnectionTest })));
const SirahLanding = lazy(() => import("./pages/sirah/Landing"));
const SirahAuth = lazy(() => import("./pages/sirah/Auth"));
const SirahOnboarding = lazy(() => import("./pages/sirah/Onboarding"));
const SirahDashboard = lazy(() => import("./pages/sirah/owner/Overview"));
const SirahClients = lazy(() => import("./pages/sirah/owner/Clients"));
const SirahClientDetail = lazy(() => import("./pages/sirah/owner/ClientDetail"));
const SirahPrograms = lazy(() => import("./pages/sirah/owner/Programs"));
const SirahProgramDetail = lazy(() => import("./pages/sirah/owner/ProgramDetail"));
const SirahClientHome = lazy(() => import("./pages/sirah/client/Home"));
import Footer from "@/components/Footer";
import { InstallPrompt } from "@/components/InstallPrompt";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
      gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

import { ThemeProvider } from "@/components/theme-provider";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme" attribute="class">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <InstallPrompt />
          <AuthProvider>
            <div className="flex flex-col min-h-screen">
              <main className="flex-grow">
                <Suspense fallback={
                  <div className="min-h-screen flex items-center justify-center bg-background">
                    <div className="flex flex-col items-center gap-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      <p className="text-muted-foreground animate-pulse">Loading wellness experience...</p>
                    </div>
                  </div>
                }>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/setup-admin" element={<SetupAdmin />} />
                    <Route path="/onboarding" element={
                      <ProtectedRoute>
                        <Onboarding />
                      </ProtectedRoute>
                    } />
                    <Route path="/dashboard" element={
                      <ProtectedRoute requiredRole="client">
                        <ClientDashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/admin" element={
                      <ProtectedRoute requiredRole="admin">
                        <AdminDashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/admin/client/:id" element={
                      <ProtectedRoute requiredRole="admin">
                        <ClientDetail />
                      </ProtectedRoute>
                    } />
                    <Route path="/admin/assessments/:id/edit-sleep" element={
                      <ProtectedRoute requiredRole="admin">
                        <AdminEditSleepAssessment />
                      </ProtectedRoute>
                    } />
                    <Route path="/admin/assessments/:id/edit-stress" element={
                      <ProtectedRoute requiredRole="admin">
                        <AdminEditStressAssessment />
                      </ProtectedRoute>
                    } />
                    <Route path="/admin/assessments/:id/edit-health" element={
                      <ProtectedRoute requiredRole="admin">
                        <AdminEditHealthAssessment />
                      </ProtectedRoute>
                    } />
                    <Route path="/client/assessments/:id/edit-sleep" element={
                      <ProtectedRoute requiredRole="client">
                        <ClientEditSleepForm />
                      </ProtectedRoute>
                    } />
                    <Route path="/client/assessments/:id/edit-stress" element={
                      <ProtectedRoute requiredRole="client">
                        <ClientEditStressForm />
                      </ProtectedRoute>
                    } />
                    <Route path="/client/assessments/:id/edit-health" element={
                      <ProtectedRoute requiredRole="client">
                        <ClientEditHealthForm />
                      </ProtectedRoute>
                    } />
                    <Route path="/interest" element={<InterestForm />} />
                    <Route path="/community" element={
                      <ProtectedRoute>
                        <Community />
                      </ProtectedRoute>
                    } />
                    <Route path="/test-connection" element={<SupabaseConnectionTest />} />
                    <Route path="/test-db" element={<DatabaseConnectionTest />} />

                    {/* SIRAH LIFE — new brand surface (parallel to legacy routes during migration) */}
                    <Route path="/sirah" element={<SirahLanding />} />
                    <Route path="/sirah/auth" element={<SirahAuth />} />
                    <Route path="/sirah/onboarding" element={<SirahOnboarding />} />
                    <Route path="/sirah/dashboard" element={<SirahDashboard />} />
                    <Route path="/sirah/clients" element={<SirahClients />} />
                    <Route path="/sirah/clients/:id" element={<SirahClientDetail />} />
                    <Route path="/sirah/programs" element={<SirahPrograms />} />
                    <Route path="/sirah/programs/:id" element={<SirahProgramDetail />} />
                    <Route path="/sirah/me" element={<SirahClientHome />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </main>
              <ConditionalFooter />
            </div>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

// Hide the legacy Sheizen-branded footer on SIRAH LIFE surfaces, which
// render their own footers as part of the dark premium layout.
function ConditionalFooter() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/sirah")) return null;
  return <Footer />;
}

export default App;
