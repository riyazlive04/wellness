import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Users, Send, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface SendAssessmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    assessmentId: string | null;
    onSuccess?: () => void;
}

export function SendAssessmentDialog({ open, onOpenChange, assessmentId, onSuccess }: SendAssessmentDialogProps) {
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            fetchClients();
        }
    }, [open]);

    const fetchClients = async () => {
        setLoading(true);
        try {
            // 1. Fetch formal clients
            const { data: clientsData, error: clientsError } = await supabase
                .from('clients')
                .select('id, name, email, status')
                .order('name');

            if (clientsError) throw clientsError;

            // 2. Fetch standalone assessments to find "Guest" names
            const { data: assessmentsData, error: assessmentsError } = await supabase
                .from('assessments')
                .select('id, display_name, form_responses')
                .is('client_id', null)
                .not('display_name', 'is', null);

            if (assessmentsError) throw assessmentsError;

            // Extract unique guest info from standalone assessments
            const guestsList: any[] = [];
            const seenEmails = new Set(clientsData?.map(c => c.email.toLowerCase()));
            const seenNames = new Set(clientsData?.map(c => c.name.toLowerCase()));

            assessmentsData?.forEach(report => {
                const name = report.display_name || "Unknown Guest";
                const responses = (report.form_responses as any) || {};
                const email = responses.personal?.email || "";
                const phone = responses.personal?.contact || "";
                
                // Only add if not already a formal client by email or name
                const lowerEmail = email.toLowerCase();
                const lowerName = name.toLowerCase();
                
                if ((email && !seenEmails.has(lowerEmail)) || (!email && !seenNames.has(lowerName))) {
                    if (email) seenEmails.add(lowerEmail);
                    seenNames.add(lowerName);
                    
                    guestsList.push({
                        id: `guest-${report.id}`, // Temporary ID for guest
                        assessmentId: report.id,
                        name: name,
                        email: email,
                        phone: phone,
                        isGuest: true,
                        status: 'lead'
                    });
                }
            });

            setClients([...(clientsData || []), ...guestsList]);
        } catch (error) {
            console.error("Error fetching clients:", error);
            toast.error("Failed to load clients");
        } finally {
            setLoading(false);
        }
    };

    const filteredClients = clients.filter(client => {
        const searchTerm = searchQuery.toLowerCase();
        const nameMatch = (client.name || "").toLowerCase().includes(searchTerm);
        const emailMatch = (client.email || "").toLowerCase().includes(searchTerm);
        return nameMatch || emailMatch;
    });

    const handleSend = async () => {
        if (!selectedClientId || !assessmentId) return;

        setSending(true);
        try {
            let targetClientId = selectedClientId;

            // 1. If it's a guest, we MUST create a client record first
            const selectedClient = clients.find(c => c.id === selectedClientId);
            if (selectedClient?.isGuest) {
                toast.info(`Creating client record for ${selectedClient.name}...`);
                
                // Try to find if a user with this email already exists in profiles
                let guestUserId = null;
                if (selectedClient.email) {
                    const { data: profileData } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('email', selectedClient.email)
                        .single();
                    if (profileData) {
                        guestUserId = profileData.id;
                    }
                }

                const { data: newClient, error: createError } = await supabase
                    .from('clients')
                    .insert({
                        name: selectedClient.name,
                        email: selectedClient.email || `guest_${Date.now()}@shiezen.com`,
                        phone: selectedClient.phone || "Not provided",
                        status: 'pending',
                        user_id: guestUserId // Link to existing profile if found, otherwise null for now
                    })
                    .select('id')
                    .single();

                if (createError) throw createError;
                targetClientId = newClient.id;
            }

            // 2. Update the assessment with the client_id and status
            const { error: updateError } = await supabase
                .from('assessments')
                .update({
                    client_id: targetClientId,
                    status: 'sent',
                    updated_at: new Date().toISOString()
                })
                .eq('id', assessmentId);

            if (updateError) throw updateError;

            // 3. Invoke the send-assessment edge function
            // We pass the updated assessment_id which now has a proper client_id
            const { error: sendError } = await supabase.functions.invoke('send-assessment', {
                body: { assessment_id: assessmentId }
            });

            if (sendError) throw sendError;

            toast.success("Assessment sent to client successfully");
            onSuccess?.();
            onOpenChange(false);
        } catch (error: any) {
            console.error("Error sending assessment:", error);
            toast.error(error.message || "Failed to send assessment");
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Send className="h-6 w-6 text-wellness-green" />
                        Send Assessment
                    </DialogTitle>
                    <DialogDescription>
                        Search and select a client. We now show formal clients and "Guests" from your reports.
                    </DialogDescription>
                </DialogHeader>

                <div className="px-6 py-2">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-wellness-green transition-colors" />
                        <Input
                            placeholder="Search by name or email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 border-slate-200 focus:border-wellness-green focus:ring-wellness-green/20"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1 max-h-[400px]">
                        <div className="px-6 pb-6 mt-2">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <Loader2 className="h-8 w-8 animate-spin text-wellness-green" />
                                    <p className="text-sm text-muted-foreground">Scanning database...</p>
                                </div>
                            ) : filteredClients.length === 0 ? (
                                <div className="text-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed mx-2">
                                    <Users className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                                    <p className="text-slate-500 font-medium">No matches found</p>
                                    <p className="text-xs text-slate-400 mt-1">Try a different name or email</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredClients.map((client) => (
                                        <div
                                            key={client.id}
                                            className={`relative flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border-2 group ${
                                                selectedClientId === client.id 
                                                    ? "border-wellness-green bg-wellness-green/5 shadow-md scale-[1.01]" 
                                                    : "border-slate-100 bg-white hover:border-wellness-mint/50 hover:bg-wellness-mint/5"
                                            }`}
                                            onClick={() => setSelectedClientId(client.id)}
                                        >
                                            {/* Avatar/Initial Circle */}
                                            <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg transition-colors rotate-3 group-hover:rotate-0 ${
                                                selectedClientId === client.id 
                                                    ? "bg-wellness-green text-white" 
                                                    : "bg-slate-100 text-slate-500"
                                            }`}>
                                                {client.name?.charAt(0).toUpperCase() || "U"}
                                            </div>
 
                                            <div className="flex-1 min-w-0 text-left">
                                                <div className="font-bold text-slate-900 flex items-center gap-2">
                                                    <span className="truncate">{client.name}</span>
                                                    {client.isGuest && (
                                                        <Badge variant="outline" className="text-[10px] h-4 bg-orange-50 text-orange-600 border-orange-200 px-1 font-bold">
                                                            GUEST
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-500 truncate mt-0.5">
                                                    {client.email || "No email provided"}
                                                </div>
                                            </div>

                                            <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                                selectedClientId === client.id 
                                                    ? "border-wellness-green bg-wellness-green shadow-sm" 
                                                    : "border-slate-200"
                                            }`}>
                                                {selectedClientId === client.id && <Check className="h-3.5 w-3.5 text-white" />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <div className="p-6 border-t flex justify-end gap-3 bg-slate-50/50">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={!selectedClientId || sending}
                        className="bg-wellness-green hover:bg-wellness-green/90"
                    >
                        {sending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send className="mr-2 h-4 w-4" />
                                Send Report
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
