import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Users, MessageSquare, Send, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sendBulkMessage } from "@/lib/messages";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<"clients">;

interface BulkMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  onSuccess?: () => void;
}

export function BulkMessageDialog({ open, onOpenChange, clients, onSuccess }: BulkMessageDialogProps) {
  const [step, setStep] = useState(1);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);
  const { userRole } = useAuth();

  const canViewPersonalInfo = userRole === "admin";

  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("message_templates")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("Error fetching templates:", error);
      return;
    }

    if (data) setTemplates(data);
  };

  const filteredClients = clients.filter((client) => {
    const matchesSearch = client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || client.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const toggleClient = (clientId: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId);
    } else {
      newSelected.add(clientId);
    }
    setSelectedClients(newSelected);
  };

  const selectAll = () => {
    setSelectedClients(new Set(filteredClients.map(c => c.id)));
  };

  const clearAll = () => {
    setSelectedClients(new Set());
  };

  const handleNext = () => {
    if (step === 1 && selectedClients.size === 0) {
      toast({
        title: "No clients selected",
        description: "Please select at least one client.",
        variant: "destructive",
      });
      return;
    }
    if (step === 2 && !selectedTemplate && !customMessage.trim()) {
      toast({
        title: "No message",
        description: "Please select a template or write a custom message.",
        variant: "destructive",
      });
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleSend = async () => {
    setSending(true);
    setProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const clientIds = Array.from(selectedClients);
      const templateId = selectedTemplate || null;
      const message = customMessage.trim() || templates.find(t => t.id === selectedTemplate)?.template || "";

      // Simulate progress updates
      const interval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 300);

      const result = await sendBulkMessage(
        clientIds, 
        templateId, 
        message, 
        user.id, 
        userRole === 'manager' ? 'manager' : 'admin'
      );

      clearInterval(interval);
      setProgress(100);
      setResult(result);

      toast({
        title: "Bulk message sent",
        description: `Successfully sent to ${result.success} clients. ${result.failed} failed.`,
      });

      if (result.failed === 0) {
        setTimeout(() => {
          onSuccess?.();
          handleClose();
        }, 2000);
      }
    } catch (error) {
      console.error("Error sending bulk message:", error);
      toast({
        title: "Failed to send",
        description: "An error occurred while sending messages.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedClients(new Set());
    setSearchQuery("");
    setFilterStatus("all");
    setSelectedTemplate("");
    setCustomMessage("");
    setSending(false);
    setProgress(0);
    setResult(null);
    onOpenChange(false);
  };

  const getPreviewMessage = (client: Client) => {
    const template = templates.find(t => t.id === selectedTemplate);
    const baseMessage = customMessage.trim() || template?.template || "";

    return baseMessage
      .replace(/\{name\}/g, client.name)
      .replace(/\{program_type\}/g, client.program_type?.replace("_", " ") || "your program")
      .replace(/\{service_type\}/g, client.service_type?.replace("_", " ") || "your service")
      .replace(/\{last_weight\}/g, client.last_weight?.toString() || "your weight")
      .replace(/\{target_kcal\}/g, client.target_kcal?.toString() || "your target");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Send Bulk Message</DialogTitle>
          <DialogDescription>
            Step {step} of 3: {step === 1 ? "Select Recipients" : step === 2 ? "Choose Message" : "Review & Send"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Step 1: Select Recipients */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {selectedClients.size} client{selectedClients.size !== 1 ? "s" : ""} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    Clear All
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[400px] border rounded-lg">
                <div className="p-4 space-y-2">
                  {filteredClients.map((client) => (
                    <Card
                      key={client.id}
                      className={`cursor-pointer transition-colors ${selectedClients.has(client.id) ? "border-primary bg-primary/5" : ""
                        }`}
                      onClick={() => toggleClient(client.id)}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <Checkbox
                          checked={selectedClients.has(client.id)}
                          onCheckedChange={() => toggleClient(client.id)}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{client.name}</div>
                          <div className="text-sm text-muted-foreground">{canViewPersonalInfo ? client.email : "***@***.com"}</div>
                        </div>
                        <Badge variant={client.status === "active" ? "default" : "secondary"}>
                          {client.status}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Step 2: Choose Template & Customize */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Select Template (Optional)</label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Custom Message</label>
                <Textarea
                  placeholder="Type your message here... Use {name}, {program_type}, {service_type}, {last_weight}, {target_kcal} for personalization."
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="min-h-[150px]"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Preview (first 3 clients)</label>
                <ScrollArea className="h-[200px] border rounded-lg p-4 space-y-3">
                  {Array.from(selectedClients).slice(0, 3).map(clientId => {
                    const client = clients.find(c => c.id === clientId);
                    if (!client) return null;
                    return (
                      <Card key={client.id}>
                        <CardContent className="p-3">
                          <div className="font-medium text-sm mb-1">{client.name}</div>
                          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {getPreviewMessage(client)}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </ScrollArea>
              </div>
            </div>
          )}

          {/* Step 3: Review & Send */}
          {step === 3 && (
            <div className="space-y-4">
              {!sending && !result && (
                <>
                  <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
                    <Users className="h-5 w-5" />
                    <div>
                      <div className="font-medium">Ready to send to {selectedClients.size} clients</div>
                      <div className="text-sm text-muted-foreground">
                        Messages will be sent with rate limiting to ensure delivery
                      </div>
                    </div>
                  </div>

                  <ScrollArea className="h-[350px] border rounded-lg p-4 space-y-3">
                    {Array.from(selectedClients).map(clientId => {
                      const client = clients.find(c => c.id === clientId);
                      if (!client) return null;
                      return (
                        <Card key={client.id}>
                          <CardContent className="p-3">
                            <div className="flex items-start gap-3">
                              <MessageSquare className="h-4 w-4 mt-1 text-muted-foreground" />
                              <div className="flex-1">
                                <div className="font-medium text-sm mb-1">{client.name}</div>
                                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                                  {getPreviewMessage(client)}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </ScrollArea>
                </>
              )}

              {sending && (
                <div className="space-y-4 py-8">
                  <div className="text-center">
                    <div className="text-lg font-medium mb-2">Sending messages...</div>
                    <div className="text-sm text-muted-foreground">
                      Please wait while we send your messages
                    </div>
                  </div>
                  <Progress value={progress} className="w-full" />
                  <div className="text-center text-sm text-muted-foreground">
                    {progress}% complete
                  </div>
                </div>
              )}

              {result && (
                <div className="space-y-4 py-8 text-center">
                  <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${result.failed === 0 ? "bg-green-100" : "bg-yellow-100"
                    }`}>
                    {result.failed === 0 ? (
                      <Check className="h-8 w-8 text-green-600" />
                    ) : (
                      <X className="h-8 w-8 text-yellow-600" />
                    )}
                  </div>
                  <div>
                    <div className="text-lg font-medium mb-1">
                      {result.failed === 0 ? "All messages sent!" : "Partially sent"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {result.success} succeeded, {result.failed} failed
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={step === 1 ? handleClose : handleBack}
            disabled={sending}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          <div className="flex gap-2">
            {step < 3 && (
              <Button onClick={handleNext}>
                Next
              </Button>
            )}
            {step === 3 && !result && (
              <Button onClick={handleSend} disabled={sending}>
                <Send className="mr-2 h-4 w-4" />
                Send to {selectedClients.size} client{selectedClients.size !== 1 ? "s" : ""}
              </Button>
            )}
            {result && (
              <Button onClick={handleClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}