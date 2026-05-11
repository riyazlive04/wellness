import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Brain, Moon, CheckCircle, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { toast } from "sonner";

interface AssessmentRequest {
  id: string;
  assessment_type: string;
  status: string;
  requested_at: string;
}

interface PendingAssessmentRequestsProps {
  clientId: string;
  onStartAssessment: (requestId: string, type: string) => void;
}

export function PendingAssessmentRequests({
  clientId,
  onStartAssessment
}: PendingAssessmentRequestsProps) {
  const [requests, setRequests] = useState<AssessmentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();

    // Real-time subscription
    const channel = supabase
      .channel('assessment-requests')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'assessment_requests',
        filter: `client_id=eq.${clientId}`
      }, (payload) => {
        fetchRequests();

        // Show browser notification for new assessment request
        const req = payload.new as any;
        const label = req?.assessment_type
          ? req.assessment_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
          : 'Assessment';

        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const n = new Notification('New Assessment Requested', {
              body: `Your nutritionist has requested a ${label}. Please complete it.`,
              icon: '/icon-192.png',
              tag: `sheizen-assessment-${req?.id || Date.now()}`,
            });
            n.onclick = () => { window.focus(); n.close(); };
          } catch (e) {}
        }

        toast.info(`New ${label} requested! Check your pending assessments.`, { duration: 8000 });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'assessment_requests',
        filter: `client_id=eq.${clientId}`
      }, () => {
        fetchRequests();
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'assessment_requests',
        filter: `client_id=eq.${clientId}`
      }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('assessment_requests')
        .select('*')
        .eq('client_id', clientId)
        .in('status', ['pending', 'in_progress'])
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching assessment requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'health_assessment': return FileText;
      case 'stress_assessment': return Brain;
      case 'sleep_assessment': return Moon;
      case 'comprehensive_assessment': return FileText;
      default: return FileText;
    }
  };

  const getLabel = (type: string) => {
    if (type === 'comprehensive_assessment') return 'Comprehensive Nutritional Assessment';
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const handleDelete = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('assessment_requests')
        .delete()
        .eq('id', requestId);

      if (error) throw error;

      toast.success("Assessment request deleted");
      // Update local state is optional because of real-time subscription, 
      // but let's do it for immediate feedback
      setRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (error: any) {
      console.error('Error deleting assessment request:', error);
      toast.error(error.message || "Failed to delete request");
    }
  };

  if (loading) return null;
  if (requests.length === 0) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CheckCircle className="h-5 w-5 text-primary" />
          Pending Assessments ({requests.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map(request => {
          const Icon = getIcon(request.assessment_type);
          return (
            <div key={request.id} className="flex items-center justify-between p-3 border rounded-lg bg-card group">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{getLabel(request.assessment_type)}</p>
                  <p className="text-sm text-muted-foreground">
                    Requested {formatDate(request.requested_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(request.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => onStartAssessment(request.id, request.assessment_type)}
                >
                  Start
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
