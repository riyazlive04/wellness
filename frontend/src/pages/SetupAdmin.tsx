import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, ShieldCheck } from "lucide-react";

const adminSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone must be at least 10 digits"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function SetupAdmin() {
  const [loading, setLoading] = useState(true);
  const [adminExists, setAdminExists] = useState(false);
  const navigate = useNavigate();

  const form = useForm<z.infer<typeof adminSchema>>({
    resolver: zodResolver(adminSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
    },
  });

  useEffect(() => {
    checkAdminExists();
  }, []);

  const checkAdminExists = async () => {
    try {
      const { data, error } = await supabase.rpc("count_admins");

      if (error) throw error;

      if (data > 0) {
        setAdminExists(true);
        toast.info("Admin account already exists. Redirecting to login...");
        setTimeout(() => navigate("/auth"), 2000);
      }
    } catch (error: any) {
      console.error("Error checking admin:", error);
      toast.error("Failed to check admin status");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof adminSchema>) => {
    setLoading(true);
    try {
      // Check again before creating
      const { data: adminCount } = await supabase.rpc("count_admins");
      if (adminCount && adminCount > 0) {
        toast.error("Admin account already exists");
        navigate("/auth");
        return;
      }

      // Use Edge Function to create admin with auto-confirmed email
      const { data: funcData, error: funcError } = await supabase.functions.invoke('create-admin', {
        body: {
          email: values.email,
          password: values.password,
          role: 'admin',
          userData: {
            name: values.name,
            phone: values.phone,
            role: 'admin',
          },
        },
      });

      if (funcError) {
        console.error("Edge Function Error:", funcError);
        throw funcError;
      }
      if (funcData.error) {
        console.error("Edge Function Data Error:", funcData.error);
        throw new Error(funcData.error);
      }

      toast.success("Admin account created successfully!");
      navigate("/auth");
    } catch (error: any) {
      console.error("Error creating admin:", error);
      toast.error(error.message || "Failed to create admin account");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wellness-light via-background to-wellness-mint/10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (adminExists) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wellness-light via-background to-wellness-mint/10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Admin Already Exists</CardTitle>
            <CardDescription className="text-center">
              Redirecting to login...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wellness-light via-background to-wellness-mint/10 p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <CardTitle className="text-2xl">First-Time Setup</CardTitle>
            <CardDescription>
              Create the first admin account for Sheizen AI Nutritionist
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="admin@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+91 " {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Admin Account
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
