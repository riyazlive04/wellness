import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Clock, Circle, Play, Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";

interface WorkflowState {
  id: string;
  workflow_stage: string;
  next_action: string | null;
  next_action_due_at: string | null;
  stage_completed_at: string | null;
  service_type: string;
  metadata: any;
}

interface WorkflowHistory {
  workflow_stage: string;
  action: string;
  triggered_at: string;
  triggered_by: string;
}

interface WorkflowTimelineProps {
  clientId: string;
}

const workflowStages = {
  consultation: [
    { key: 'consultation_scheduled', label: 'Consultation Scheduled' },
    { key: 'health_assessment_sent', label: 'Health Assessment Sent' },
    { key: 'action_plan_generated', label: 'Action Plan Generated' },
    { key: 'diet_plan_generated', label: 'Diet Plan Generated' },
    { key: 'consultation_complete', label: 'Consultation Complete' },
    { key: 'soft_retargeting_active', label: 'Soft Retargeting Active' },
  ],
  hundred_days: [
    { key: 'consultation_scheduled', label: 'Consultation Scheduled' },
    { key: 'health_assessment_sent', label: 'Health Assessment Sent (30 mins)' },
    { key: 'stress_card_sent', label: 'Stress Card Sent (2-3 hrs)' },
    { key: 'sleep_card_sent', label: 'Sleep Card Sent (6 hrs)' },
    { key: 'action_plan_sent', label: 'Action Plan Sent (2-3 days)' },
    { key: 'diet_plan_sent', label: 'Diet Plan Sent (2-3 days)' },
    { key: 'grocery_list_sent', label: 'Grocery List Sent' },
    { key: 'program_active', label: 'Program Active' },
  ],
};

export const WorkflowTimeline = ({ clientId }: WorkflowTimelineProps) => {
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [history, setHistory] = useState<WorkflowHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetchWorkflowData();
  }, [clientId]);

  const fetchWorkflowData = async () => {
    try {
      const { data: state, error: stateError } = await supabase
        .from('client_workflow_state')
        .select('*')
        .eq('client_id', clientId)
        .single();

      if (stateError && stateError.code !== 'PGRST116') throw stateError;
      setWorkflowState(state);

      const { data: hist, error: histError } = await supabase
        .from('workflow_history')
        .select('*')
        .eq('client_id', clientId)
        .order('triggered_at', { ascending: false });

      if (histError) throw histError;
      setHistory(hist || []);
    } catch (error) {
      console.error('Error fetching workflow data:', error);
      toast.error("Failed to load workflow data");
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerStage = async (stageKey: string) => {
    setTriggering(true);
    try {
      const { error } = await supabase.functions.invoke('trigger-workflow-stage', {
        body: { client_id: clientId, stage: stageKey },
      });

      if (error) throw error;

      toast.success("Workflow stage triggered successfully");
      fetchWorkflowData();
    } catch (error) {
      console.error('Error triggering workflow stage:', error);
      toast.error("Failed to trigger workflow stage");
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  if (!workflowState) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">No workflow initiated for this client yet.</p>
      </Card>
    );
  }

  const stages = workflowStages[workflowState.service_type as keyof typeof workflowStages] || [];
  const currentStageIndex = stages.findIndex(s => s.key === workflowState.workflow_stage);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Workflow Progress</h3>
        <div className="space-y-4">
          {stages.map((stage, index) => {
            const isCompleted = index < currentStageIndex;
            const isCurrent = index === currentStageIndex;
            const isPending = index > currentStageIndex;

            return (
              <div key={stage.key} className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1">
                  {isCompleted && <CheckCircle2 className="h-6 w-6 text-green-600" />}
                  {isCurrent && <Clock className="h-6 w-6 text-primary" />}
                  {isPending && <Circle className="h-6 w-6 text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className={`font-medium ${isCurrent ? 'text-primary' : ''}`}>
                      {stage.label}
                    </p>
                    {isCurrent && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTriggerStage(stage.key)}
                        disabled={triggering}
                      >
                        {triggering ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-1" />
                            Trigger
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  {isCompleted && workflowState.stage_completed_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Completed {formatDateTime(workflowState.stage_completed_at)}
                    </p>
                  )}
                  {isCurrent && workflowState.next_action_due_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Due {formatDateTime(workflowState.next_action_due_at)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {history.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Workflow History</h3>
          <div className="space-y-3">
            {history.map((item, index) => (
              <div key={index} className="text-sm border-l-2 border-muted pl-4 py-2">
                <p className="font-medium">{item.action}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(item.triggered_at)} •
                  Triggered by {item.triggered_by === 'system' ? 'System' : 'Admin'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
