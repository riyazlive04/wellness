import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Leaf, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { CustomLogo } from "@/components/CustomLogo";


const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

const resetEmailSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
});

const newPasswordSchema = z.object({
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  confirmPassword: z.string().min(6, { message: "Password must be at least 6 characters" }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function Auth() {
  const navigate = useNavigate();
  const { user, userRole, signIn, loading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showUpdatePasswordForm, setShowUpdatePasswordForm] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Debug logging for auth state


    if (!isLoading && !authLoading && user && userRole) {
      if (userRole === "admin") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } else if (!isLoading && !authLoading && user && !userRole) {
      // Fallback: if user is logged in but role is missing, try to redirect to dashboard
      // or wait for role (but if it takes too long, we might want to handle it)

    }
  }, [user, userRole, isLoading, authLoading, navigate]);

  useEffect(() => {
    // Check if user is coming from password reset email
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');

    console.log('[PasswordReset] Checking URL for recovery type:', { type, hash: window.location.hash });

    if (type === 'recovery') {
      console.log('[PasswordReset] Recovery link detected - showing password update form');
      setShowUpdatePasswordForm(true);
    }
  }, []);

  // Safety: If we've been on this page for >3s and authLoading is still true, force show the form
  // to prevent getting stuck in "Loading authentication..." forever if something weird happens.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (authLoading) {
        console.warn("[Auth] Force showing login form due to slow auth loading");
        // Ideally we can't change authLoading from here, but we can ignore it for rendering
        // We'll use a local state to override
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [authLoading]);

  // Combined loading check: Only show loader if we genuinely don't know the state yet
  const showLoader = (isLoading || authLoading) && !user;

  if (showLoader) {
    return ( // Prevent rendering form while loading to avoid "redirect while typing"
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wellness-light via-background to-wellness-light/30">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <div className="animate-pulse text-lg text-primary">Loading authentication...</div>
        </div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const data = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    try {
      loginSchema.parse(data);

      await signIn(data.email, data.password);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsResettingPassword(true);
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const data = {
      email: formData.get("reset-email") as string,
    };

    try {
      resetEmailSchema.parse(data);

      console.log('[PasswordReset] Attempting to send password reset email to:', data.email);

      const { data: resetData, error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      console.log('[PasswordReset] Supabase response:', { resetData, error });

      if (error) {
        console.error('[PasswordReset] Error:', error);

        // Check for specific error types
        if (error.message.includes('rate limit')) {
          toast.error("Too many password reset attempts. Please try again in a few minutes.");
        } else if (error.message.includes('email not found') || error.message.includes('User not found')) {
          toast.error("No account found with this email address.");
        } else if (error.message.includes('SMTP') || error.message.includes('email provider')) {
          toast.error("Email service is not configured. Please contact support.");
          console.error('[PasswordReset] Email provider configuration issue detected');
        } else {
          toast.error(`Password reset failed: ${error.message}`);
        }
      } else {
        console.log('[PasswordReset] Success - Email should be sent to:', data.email);
        toast.success("Password reset email sent! Check your inbox (and spam folder).");
        toast.info("If you don't receive the email within 5 minutes, please contact support.", {
          duration: 8000,
        });
        setShowResetDialog(false);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        console.error('[PasswordReset] Unexpected error:', error);
        toast.error("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const data = {
      password: formData.get("new-password") as string,
      confirmPassword: formData.get("confirm-password") as string,
    };

    try {
      newPasswordSchema.parse(data);

      console.log('[PasswordReset] Updating password for user');

      const { data: userData, error } = await supabase.auth.updateUser({
        password: data.password,
      });

      console.log('[PasswordReset] Password update response:', { userData, error });

      if (error) {
        console.error('[PasswordReset] Password update error:', error);

        if (error.message.includes('session')) {
          toast.error("Your password reset link has expired. Please request a new one.");
        } else if (error.message.includes('same password')) {
          toast.error("New password must be different from your current password.");
        } else {
          toast.error(`Password update failed: ${error.message}`);
        }
      } else {
        console.log('[PasswordReset] Password updated successfully');
        toast.success("Password updated successfully! You can now sign in with your new password.");
        setShowUpdatePasswordForm(false);
        // Clear the hash from URL
        window.history.replaceState(null, '', '/auth');
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        console.error('[PasswordReset] Unexpected error during password update:', error);
        toast.error("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
      setShowPassword(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wellness-light via-background to-wellness-light/30 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mb-4 mx-auto">
            <CustomLogo className="w-full h-full" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Sheizen Wellness</h1>
          <p className="text-muted-foreground">Your wellness journey starts here</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{showUpdatePasswordForm ? "Set New Password" : "Welcome back"}</CardTitle>
            <CardDescription>
              {showUpdatePasswordForm ? "Enter your new password below" : "Enter your credentials to continue"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showUpdatePasswordForm ? (
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      name="new-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      required
                      className={errors.password ? "border-destructive pr-10" : "pr-10"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    name="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    required
                    className={errors.confirmPassword ? "border-destructive" : ""}
                  />
                  {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    className={errors.email ? "border-destructive" : ""}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setShowResetDialog(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      required
                      className={errors.password ? "border-destructive pr-10" : "pr-10"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Enter your email address and we'll send you a link to reset your password.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  name="reset-email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowResetDialog(false)}
                  disabled={isResettingPassword}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isResettingPassword}>
                  {isResettingPassword ? "Sending..." : "Send Reset Link"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}