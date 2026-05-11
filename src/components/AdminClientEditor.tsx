import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface AdminClientEditorProps {
  clientId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (newClientId?: string | null) => void;
  initialData?: {
    name?: string;
    email?: string;
    phone?: string;
    age?: string;
    gender?: string;
    program_type?: string;
    goals?: string;
  };
}

export function AdminClientEditor({ clientId, open, onOpenChange, onSuccess, initialData }: AdminClientEditorProps) {
  const { userRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    age: "",
    gender: "",
    service_type: "",
    program_type: "",
    target_kcal: "",
    status: "active",
    goals: "",
  });

  const [userId, setUserId] = useState<string | null>(null);

  // Helper: Managers cannot view/edit sensitive contact info
  const canViewSensitiveInfo = userRole === "admin";

  useEffect(() => {
    console.log("AdminClientEditor useEffect trigger. Open:", open, "ClientId:", clientId, "InitialData:", initialData);
    if (clientId && open) {
      fetchClientData();
    } else if (!clientId && open) {
      if (initialData) {
        setFormData(prev => ({
          ...prev,
          name: initialData.name || "",
          email: initialData.email || "",
          phone: initialData.phone || "",
          age: initialData.age || "",
          gender: initialData.gender || "",
          program_type: initialData.program_type || "",
          goals: initialData.goals || "",
          password: "",
          service_type: "",
          target_kcal: "",
          status: "active",
        }));
      } else {
        resetForm();
      }
    }
  }, [clientId, open, initialData]);

  const fetchClientData = async () => {
    if (!clientId) return;

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    if (error) {
      toast.error("Failed to fetch client data");
      return;
    }

    if (data) {
      setUserId(data.user_id); // Store the Auth User ID
      setFormData({
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || "",
        password: "",
        age: data.age?.toString() || "",
        gender: data.gender || "",
        service_type: data.service_type || "",
        program_type: data.program_type || "",
        target_kcal: data.target_kcal?.toString() || "",
        status: data.status || "active",
        goals: data.goals || "",
      });
    }
  };

  const resetForm = () => {
    setUserId(null);
    setFormData({
      name: "",
      email: "",
      phone: "",
      password: "",
      age: "",
      gender: "",
      service_type: "",
      program_type: "",
      target_kcal: "",
      status: "active",
      goals: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let finalClientId = clientId;

      if (clientId) {
        // Update existing client
        // Managers should not update email/phone if they can't see it (though Supabase might ignore it if data is masked)
        // But to be safe and clean, we pass current masked values?? No, that would overwrite with stars.
        // We should ONLY update fields that are safe.
        // If canViewSensitiveInfo is false, we should OMIT email/phone from the update or pass original values if known.
        // Better: don't include them in the update payload if manager.

        const updatePayload: any = {
          name: formData.name,
          age: formData.age ? parseInt(formData.age) : null,
          gender: formData.gender as any,
          service_type: formData.service_type as any,
          program_type: formData.program_type as any,
          target_kcal: formData.target_kcal ? parseInt(formData.target_kcal) : null,
          status: formData.status as any,
          goals: formData.goals || null,
        };

        if (userRole === "admin") {
          updatePayload.email = formData.email;
          updatePayload.phone = formData.phone;
        }

        const { error } = await supabase
          .from("clients")
          .update(updatePayload)
          .eq("id", clientId);

        if (error) throw error;
        toast.success("Client updated successfully");
      } else {
        // Create new client with user account
        // Managers probably shouldn't be creating clients if they can't set email/phone?
        // But if they have the form, they can enter new email/phone. Privacy is for EXISTING clients.
        // Wait, if they enter it, they know it. So masking on creation form is not needed, but masking on EDIT is.
        // But "Add Client" is restricted for Managers? No, AdminDashboard usually allows "New Client".
        // If Manager creates client, they must input email.

        if (!formData.password) {
          toast.error("Password is required for new clients");
          return;
        }

        // Create auth user AND client record via Edge Function (server-side to bypass RLS)
        const { data: funcData, error: funcError } = await supabase.functions.invoke('create-user', {
          body: {
            email: formData.email,
            password: formData.password,
            userData: {
              name: formData.name,
              phone: formData.phone,
              age: formData.age,
              gender: formData.gender,
              service_type: formData.service_type,
              program_type: formData.program_type,
              target_kcal: formData.target_kcal,
              status: formData.status,
              goals: formData.goals,
            },
          },
        });

        console.log("Edge Function Response Data:", funcData); // DEBUG: Check what we actually got

        if (funcError) {
          console.error("Edge Function Error:", funcError);
          throw funcError;
        }
        if (funcData.error) {
          console.error("Edge Function Data Error:", funcData.error);
          throw new Error(funcData.error);
        }

        const authUser = funcData.user.user;
        const newClient = funcData.client;

        if (!authUser) throw new Error("Failed to create user account");

        // Use the ID returned from the Edge Function
        if (newClient) {
          finalClientId = newClient.id;
        } else {
          // Warning if no client data returned
          console.warn("Edge function did not return client data. Attempting fallback fetch...");

          // Fallback: Fetch new client ID
          const { data: fetchedClient, error: fetchError } = await supabase
            .from("clients")
            .select("id")
            .eq("user_id", authUser.id)
            .maybeSingle(); // Use maybeSingle to avoid 406 Not Acceptable if no row exists

          if (fetchError) {
            console.error("Fallback fetch error:", fetchError);
            throw new Error("Could not verify client creation.");
          }

          if (fetchedClient) {
            finalClientId = fetchedClient.id;
          } else {
            throw new Error("User created but Client record missing. Please check logs.");
          }
        }

        toast.success("Client created successfully");
      }

      onSuccess(finalClientId);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save client");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{clientId ? "Edit Client" : "Add Client"}</DialogTitle>
          <DialogDescription>
            {clientId ? "Update client information and program details" : "Create a new client account with program details"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                onlyAlphabets
              />
            </div>

            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                // Mask email if editing existing client AND user is not admin
                value={clientId && userRole !== "admin" ? "***@***.com" : formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                // Disable if editing and restricted (cannot edit email if you can't see it)
                disabled={!!clientId && userRole !== "admin"}
              />
            </div>
          </div>

          {!clientId && (
            <div>
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                placeholder="Minimum 6 characters"
                minLength={6}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                // Mask phone if editing existing client AND user is not admin
                value={clientId && userRole !== "admin" ? "**********" : formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
                // Disable if editing and restricted
                disabled={!!clientId && userRole !== "admin"}
                onlyNumbers
              />
            </div>

            <div>
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                value={(clientId && (userRole === "admin" || userRole === "manager")) || !clientId ? formData.age : ""}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                disabled={!!clientId && userRole !== "admin" && userRole !== "manager"}
                onlyNumbers
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={(clientId && (userRole === "admin" || userRole === "manager")) || !clientId ? formData.gender : "hidden"}
                onValueChange={(value) => setFormData({ ...formData, gender: value })}
                disabled={!!clientId && userRole !== "admin" && userRole !== "manager"}
              >
                <SelectTrigger>
                  <SelectValue placeholder={(clientId && (userRole === "admin" || userRole === "manager")) || !clientId ? "Select gender" : "Restricted"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="hidden" className="hidden">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="service_type">Service Type</Label>
              <Select
                value={(clientId && (userRole === "admin" || userRole === "manager")) || !clientId ? formData.service_type : "hidden"}
                onValueChange={(value) => setFormData({ ...formData, service_type: value })}
                disabled={!!clientId && userRole !== "admin" && userRole !== "manager"}
              >
                <SelectTrigger>
                  <SelectValue placeholder={(clientId && (userRole === "admin" || userRole === "manager")) || !clientId ? "Select service type" : "Restricted"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultation">One-Time Nutrition Consultation</SelectItem>
                  <SelectItem value="hundred_days">100-Days Nutrition Program</SelectItem>
                  <SelectItem value="hidden" className="hidden">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="program_type">Health Goal</Label>
              <Select
                value={(clientId && (userRole === "admin" || userRole === "manager")) || !clientId ? formData.program_type : "hidden"}
                onValueChange={(value) => setFormData({ ...formData, program_type: value })}
                disabled={!!clientId && userRole !== "admin" && userRole !== "manager"}
              >
                <SelectTrigger>
                  <SelectValue placeholder={(clientId && (userRole === "admin" || userRole === "manager")) || !clientId ? "Select health goal" : "Restricted"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weight_loss">Weight Loss</SelectItem>
                  <SelectItem value="weight_gain">Weight Gain</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="manage_pcod">Manage PCOD</SelectItem>
                  <SelectItem value="thyroid">Thyroid</SelectItem>
                  <SelectItem value="diabetes">Diabetes</SelectItem>
                  <SelectItem value="cholesterol">Cholesterol</SelectItem>
                  <SelectItem value="general_wellness">General Wellness</SelectItem>
                  <SelectItem value="others">Others</SelectItem>
                  <SelectItem value="hidden" className="hidden">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.program_type === "others" && (
              <div>
                <Label htmlFor="other_goal">Please specify your health goal</Label>
                <Input
                  id="other_goal"
                  value={formData.goals}
                  onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                  placeholder="Enter your specific health goal"
                />
              </div>
            )}

            <div>
              <Label htmlFor="target_kcal">Target Kcal</Label>
              <Input
                id="target_kcal"
                type="number"
                value={(clientId && (userRole === "admin" || userRole === "manager")) || !clientId ? formData.target_kcal : ""}
                onChange={(e) => setFormData({ ...formData, target_kcal: e.target.value })}
                disabled={!!clientId && userRole !== "admin" && userRole !== "manager"}
                onlyNumbers
              />
            </div>
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="goals">Goals</Label>
            <Textarea
              id="goals"
              value={(clientId && (userRole === "admin" || userRole === "manager")) || !clientId ? formData.goals : "Restricted"}
              onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
              rows={3}
              disabled={!!clientId && userRole !== "admin" && userRole !== "manager"}
            />
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            {clientId && (
              <Button
                type="button"
                variant="destructive"
                onClick={async () => {
                  if (window.confirm("Are you sure you want to delete this client? This action cannot be undone and will remove all associated data.")) {
                    try {
                      setLoading(true);

                      // We need the Auth User ID, not just the client ID
                      if (!userId) {
                        toast.error("Cannot delete: User ID not found");
                        return;
                      }

                      const { error } = await supabase.functions.invoke('delete-user', {
                        body: { user_id: userId }
                      });

                      if (error) throw error;

                      toast.success("Client deleted successfully");
                      onSuccess(null); // Pass null to indicate deletion/reset
                      onOpenChange(false);
                    } catch (error: any) {
                      console.error("Delete error:", error);
                      toast.error("Failed to delete client: " + (error.message || "Unknown error"));
                    } finally {
                      setLoading(false);
                    }
                  }
                }}
                disabled={loading}
              >
                Delete Client
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : clientId ? "Update Client" : "Add Client"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
