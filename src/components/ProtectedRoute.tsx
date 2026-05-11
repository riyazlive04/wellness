import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole?: "admin" | "client" | "manager";
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
    const { user, userRole, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/auth" state={{ from: location }} replace />;
    }

    // Backup role check: If context userRole is missing, use metadata as a safety fallback
    const effectiveRole = userRole || (user.user_metadata?.role as "admin" | "client" | "manager" | null);

    if (requiredRole && effectiveRole !== requiredRole) {
        // If user has no role at all, they likely haven't completed onboarding
        if (!effectiveRole) {
            // CRITICAL: If we have a user but no role yet, DON'T redirect immediately.
            // This might be a race condition during reload where metadata is still syncing.
            // Instead, show the loader one more time or wait for AuthContext to finish.
            console.log("[ProtectedRoute] No effective role found for user. Waiting or redirecting...");

            // If we've already waited (i.e., not loading anymore), then redirect.
            // But we add a small safety buffer here.
            return (
                <div className="min-h-screen flex items-center justify-center bg-background">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-muted-foreground animate-pulse">Verifying permissions...</p>
                    </div>
                </div>
            );
        }

        // Allow managers to access admin routes
        if (requiredRole === "admin" && effectiveRole === "manager") {
            // Manager can access admin dashboard
            return <>{children}</>;
        }

        // Redirect to correct dashboard if role doesn't match
        if (effectiveRole === "admin" || effectiveRole === "manager") {
            return <Navigate to="/admin" replace />;
        } else {
            return <Navigate to="/dashboard" replace />;
        }
    }

    // Special case: If we are on onboarding but have a role, send to dashboard
    if (location.pathname === "/onboarding" && effectiveRole) {
        const dashboard = (effectiveRole === "admin" || effectiveRole === "manager") ? "/admin" : "/dashboard";
        return <Navigate to={dashboard} replace />;
    }

    return <>{children}</>;
}
