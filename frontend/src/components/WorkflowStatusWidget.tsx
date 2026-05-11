import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle } from "lucide-react";

interface WorkflowStats {
  overdueCount: number;
  upcomingCount: number;
}

export const WorkflowStatusWidget = () => {
  const fetchStats = async (): Promise<WorkflowStats> => {
    const now = new Date().toISOString();
    const next24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Run queries in parallel
    const [overdueResult, upcomingResult, pendingCardsResult] = await Promise.all([
      supabase
        .from('client_workflow_state')
        .select('id')
        .not('next_action_due_at', 'is', null)
        .lt('next_action_due_at', now),
      supabase
        .from('client_workflow_state')
        .select('id')
        .not('next_action_due_at', 'is', null)
        .gte('next_action_due_at', now)
        .lt('next_action_due_at', next24Hours),
      supabase
        .from('pending_review_cards')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'edited'])
    ]);

    return {
      overdueCount: (overdueResult.data?.length || 0) + (pendingCardsResult.count || 0),
      upcomingCount: upcomingResult.data?.length || 0,
    };
  };

  const { data: stats, isLoading } = useQuery({
    queryKey: ['workflow-stats'],
    queryFn: fetchStats,
  });

  if (isLoading || !stats) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Workflow Status</h3>
      </div>
      <div className="space-y-3">
        {stats.overdueCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Clients needing attention
            </span>
            <Badge variant="destructive">{stats.overdueCount}</Badge>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Upcoming actions (24h)</span>
          <Badge variant="secondary">{stats.upcomingCount}</Badge>
        </div>
      </div>
    </Card>
  );
};
