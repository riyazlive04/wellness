import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Users, TrendingUp, Heart } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export default function Home() {
  const navigate = useNavigate();
  const { user, userRole } = useAuth();

  useEffect(() => {
    if (user && userRole) {
      if (userRole === "admin") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    }
  }, [user, userRole, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-wellness-light via-background to-wellness-light/30">
      {/* Theme Toggle - Fixed Position */}
      <div className="fixed top-4 right-4 z-50">
        <ModeToggle />
      </div>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center max-w-4xl mx-auto mb-16 animate-fade-in">
          <div className="flex justify-center mb-6">
            <img
              src="/sheizen-landing-logo.png"
              alt="Sheizen Wellness Logo"
              className="h-40 w-auto object-contain"
            />
          </div>
          {/* <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary to-wellness-mint bg-clip-text text-transparent">
            Sheizen Wellness
          </h1> */}
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Your personalized wellness journey starts here. Connect with expert dietitians and achieve your health goals with AI-powered nutrition guidance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              className="text-lg px-8"
              onClick={() => navigate("/interest")}
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8"
              onClick={() => navigate("/auth")}
            >
              Sign In
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="card-hover border-2 border-border/50">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-wellness-green/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-wellness-green" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Expert Guidance</h3>
              <p className="text-muted-foreground">
                Work with certified dietitians who create personalized meal plans tailored to your unique goals and preferences.
              </p>
            </CardContent>
          </Card>

          <Card className="card-hover border-2 border-border/50">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-wellness-mint/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-wellness-mint" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Track Progress</h3>
              <p className="text-muted-foreground">
                Monitor your daily intake, weight, and activities with our intuitive tracking tools and insightful analytics.
              </p>
            </CardContent>
          </Card>

          <Card className="card-hover border-2 border-border/50">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-wellness-amber/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Achieve Wellness</h3>
              <p className="text-muted-foreground">
                Reach your health goals with sustainable nutrition plans, ongoing support, and weekly progress reports.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="mt-20 text-center">
          <Card className="max-w-3xl mx-auto bg-gradient-to-r from-primary/10 to-wellness-mint/10 border-2">
            <CardContent className="p-12">
              <h2 className="text-3xl font-bold mb-4">Ready to transform your health?</h2>
              <p className="text-lg text-muted-foreground mb-6">
                Join thousands of people achieving their wellness goals with personalized nutrition guidance.
              </p>
              <Button
                className="text-lg px-10"
                onClick={() => navigate("/interest")}
              >
                Start Your Journey Today
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}