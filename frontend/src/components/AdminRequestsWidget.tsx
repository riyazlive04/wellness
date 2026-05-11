import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, X, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { getSignedUrl } from "@/lib/storage";

interface AdminRequest {
    id: string;
    client_id: string;
    request_type: string;
    status: 'pending' | 'resolved' | 'dismissed';
    metadata: any;
    created_at: string;
    client?: {
        name: string;
        email: string;
    };

}

function RequestImage({ path }: { path: string }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (path) {
            getSignedUrl("meal-photos", path).then(setUrl).catch(console.error);
        }
    }, [path]);

    if (!url) return <div className="h-24 w-24 bg-muted animate-pulse rounded-md" />;

    return (
        <div className="relative group w-fit">
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
            >
                <img
                    src={url}
                    alt="Attachment"
                    className="h-24 w-auto object-cover rounded-md border hover:opacity-90 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/50 rounded-md transition-opacity pointer-events-none">
                    <ExternalLink className="text-white h-6 w-6" />
                </div>
            </a>
        </div>
    );
}

export function AdminRequestsWidget() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const fetchRequests = async () => {
        const { data, error } = await supabase
            .from("admin_requests")
            .select(`
          *,
          client:clients (
            name,
            email
          )
        `)
            .eq("status", "pending")
            .order("created_at", { ascending: false });


        // Transform data and sort: Urgent queries first, then by date
        const formattedData = (data?.map(item => {
            const client = Array.isArray(item.client) ? item.client[0] : item.client;
            return {
                ...item,
                client: client || { name: "Unknown Client", email: "N/A" }
            };
        }) as AdminRequest[]) || [];

        const sortedData = [...formattedData].sort((a, b) => {
            if (a.request_type === 'urgent_query' && b.request_type !== 'urgent_query') return -1;
            if (a.request_type !== 'urgent_query' && b.request_type === 'urgent_query') return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return sortedData;
    };

    const { data: requests = [], isLoading } = useQuery({
        queryKey: ['admin-requests'],
        queryFn: fetchRequests,
    });

    // Realtime subscription for live updates
    useEffect(() => {
        const channel = supabase
            .channel('admin-requests-widget')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'admin_requests' },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['admin-requests'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    const handleUpdateStatus = async (id: string, newStatus: 'resolved' | 'dismissed') => {
        try {
            const { error } = await supabase
                .from("admin_requests")
                .update({ status: newStatus })
                .eq("id", id);

            if (error) throw error;

            toast.success(`Request ${newStatus}`);
            queryClient.invalidateQueries({ queryKey: ['admin-requests'] });
        } catch (error) {
            console.error("Error updating request:", error);
            toast.error("Failed to update status");
        }
    };

    const hasUrgent = requests.some(r => r.request_type === 'urgent_query');

    return (
        <Card className={`${hasUrgent ? 'border-l-4 border-l-red-600 shadow-lg ring-1 ring-red-200 animate-pulse' : 'border-l-4 border-l-amber-500 shadow-md'} animate-fade-in`}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-100 rounded-full">
                            <Bell className="h-5 w-5 text-amber-600 animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <CardTitle>Client Requests</CardTitle>
                                {hasUrgent && (
                                    <Badge variant="destructive" className="animate-bounce">
                                        URGENT ACTION REQUIRED
                                    </Badge>
                                )}
                            </div>
                            <CardDescription>{requests.length} pending request{requests.length !== 1 ? 's' : ''}</CardDescription>
                        </div>
                    </div>
                </div>
                {hasUrgent && (
                    <div className="mt-4 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs font-bold flex items-center gap-2 animate-pulse">
                        <AlertCircle className="h-4 w-4" />
                        Clients are waiting for urgent food query approvals!
                    </div>
                )}
            </CardHeader>
            <CardContent>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {requests.map(request => (
                        <div key={request.id} className="flex flex-col sm:flex-row gap-3 p-3 bg-muted/50 rounded-lg border text-sm">
                            <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold">{request.client?.name || "Unknown Client"}</span>
                                    <span className="text-xs text-muted-foreground">{new Date(request.created_at).toLocaleString()}</span>
                                </div>
                                <div className="mb-2">
                                    {request.request_type === 'urgent_query' ? (
                                        <>
                                            <Badge variant="destructive" className="mr-2 animate-pulse">
                                                URGENT
                                            </Badge>
                                            <div className="flex flex-col gap-2 mt-1">
                                                <span className="text-red-600 font-medium block">
                                                    {request.metadata?.message}
                                                </span>
                                                {request.metadata?.image_path && (
                                                    <RequestImage path={request.metadata.image_path} />
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <Badge variant="outline" className="mr-2 capitalize">
                                                {request.request_type.replace('_', ' ')}
                                            </Badge>
                                            <span className="text-muted-foreground">
                                                {request.metadata?.meal_name && `Check meal "${request.metadata.meal_name}"`}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 p-0"
                                    onClick={() => navigate(`/admin/client/${request.client_id}`)}
                                    title="View Client"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="default"
                                    className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700"
                                    onClick={() => handleUpdateStatus(request.id, 'resolved')}
                                    title="Mark Resolved"
                                >
                                    <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600"
                                    onClick={() => handleUpdateStatus(request.id, 'dismissed')}
                                    title="Dismiss"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
