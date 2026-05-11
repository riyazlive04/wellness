import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { z } from "zod";
import { CustomLogo } from "@/components/CustomLogo";

const interestFormSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name must be less than 100 characters"),
  age: z.number().int().min(10, "Age must be at least 10").max(120, "Age must be less than 120"),
  gender: z.enum(["male", "female", "other"], { required_error: "Please select a gender" }),
  phone: z.string().trim().min(10, "Contact number must be at least 10 digits").max(15, "Contact number must be less than 15 digits"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  health_goal: z.enum(["weight_loss", "muscle_gain", "diabetes", "pcos", "lifestyle_correction"], { required_error: "Please select a health goal" }),
  message: z.string().optional(),
});

export default function InterestForm() {
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    gender: "",
    phone: "",
    email: "",
    health_goal: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate form data
      const validatedData = interestFormSchema.parse({
        ...formData,
        age: parseInt(formData.age),
      });

      // Submit to database
      const { error } = await supabase
        .from("interest_forms" as any)
        .insert({
          name: validatedData.name,
          age: validatedData.age,
          gender: validatedData.gender,
          phone: validatedData.phone,
          email: validatedData.email,
          health_goal: validatedData.health_goal,
          message: validatedData.message,
        });

      if (error) throw error;

      setSubmitted(true);
      toast.success("Thank you for your interest! We'll contact you soon.");

      // Reset form
      setFormData({
        name: "",
        age: "",
        gender: "",
        phone: "",
        email: "",
        health_goal: "",
        message: "",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        toast.error(firstError.message);
      } else {
        console.error("Error submitting form:", error);
        toast.error((error as any).message || "Failed to submit form. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-wellness-light/20 via-background to-wellness-light/10 dark:from-wellness-dark/20 dark:via-background dark:to-wellness-dark/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg animate-fade-in shadow-2xl border-border/50">
          <CardContent className="pt-12 pb-12 text-center">
            <div className="w-20 h-20 bg-wellness-green/10 dark:bg-wellness-green/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-wellness-green" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Thank You!</h2>
            <p className="text-muted-foreground mb-6 text-lg">
              We've received your information and will get in touch with you soon to discuss your wellness journey.
            </p>
            <Button
              onClick={() => setSubmitted(false)}
              variant="outline"
              className="border-wellness-green text-wellness-green hover:bg-wellness-green/10 dark:hover:bg-wellness-green/20"
            >
              Submit Another Response
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-wellness-light/20 via-background to-wellness-light/10 dark:from-wellness-dark/20 dark:via-background dark:to-wellness-dark/10">
      {/* Header Section */}
      <div className="text-center mb-8 animate-fade-in pt-12 px-4">
        <div className="w-20 h-20 mb-4 mx-auto">
          <CustomLogo className="w-full h-full" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-wellness-green to-wellness-dark bg-clip-text text-transparent dark:from-wellness-green dark:to-wellness-light">
          Sheizen Wellness
        </h1>
        <p className="text-xl text-muted-foreground">Start Your Wellness Journey Today</p>
      </div>

      {/* Interest Form */}
      <div className="px-4 pb-12">
        <Card className="animate-fade-in shadow-2xl max-w-2xl mx-auto border-border/50">
          <CardHeader className="space-y-2 pb-6">
            <CardTitle className="text-2xl text-center">Express Your Interest</CardTitle>
            <CardDescription className="text-center text-base">
              Fill out the form below and our team will reach out to discuss a personalized nutrition plan for you
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  maxLength={100}
                  className="h-11"
                  onlyAlphabets
                />
              </div>

              {/* Age & Gender */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="age">Age *</Label>
                  <Input
                    id="age"
                    type="number"
                    placeholder="25"
                    min="10"
                    max="120"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    required
                    className="h-11"
                    onlyNumbers
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender">Gender *</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => setFormData({ ...formData, gender: value })}
                    required
                  >
                    <SelectTrigger id="gender" className="h-11">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Contact Number */}
              <div className="space-y-2">
                <Label htmlFor="phone">Contact Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+91 "
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  maxLength={15}
                  className="h-11"
                  onlyNumbers
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email ID *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  maxLength={255}
                  className="h-11"
                />
              </div>

              {/* Health Goal */}
              <div className="space-y-2">
                <Label htmlFor="health-goal">Health Goal *</Label>
                <Select
                  value={formData.health_goal}
                  onValueChange={(value) => setFormData({ ...formData, health_goal: value })}
                  required
                >
                  <SelectTrigger id="health-goal" className="h-11">
                    <SelectValue placeholder="Select your primary health goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weight_loss">Weight Loss</SelectItem>
                    <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                    <SelectItem value="diabetes">Diabetes Management</SelectItem>
                    <SelectItem value="pcos">PCOS Management</SelectItem>
                    <SelectItem value="lifestyle_correction">Lifestyle Correction</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="message">Message (Optional)</Label>
                <Textarea
                  id="message"
                  placeholder="Tell us more about your goals or any medical conditions..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows={4}
                  className="resize-none"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-wellness-green hover:bg-wellness-green/90 text-white"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Interest Form"
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground pt-2">
                By submitting this form, you agree to be contacted by our team regarding your wellness journey.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
