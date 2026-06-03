import { Sparkles } from 'lucide-react';
import { PendingPage } from '@/modules/super-admin/components/PendingPage';

export default function AdminAiUsage() {
  return (
    <PendingPage
      icon={Sparkles}
      title="AI usage"
      description="Gemini token spend, voice minutes, vision-image calls — per workspace, with quota alerts."
      waitingOn="A usage-tracking middleware on the backend that emits one row per Gemini call to a new ai_usage_events table"
      willInclude={[
        'Real-time usage dashboard with breakdown by service (chat / voice / vision)',
        'Per-workspace burn rate — which nutritionist is consuming the most',
        'Cost analysis: actual USD/INR spend vs revenue per workspace',
        'Quota alerts when a workspace hits 80% / 100% of their plan',
        'Anomaly detection — sudden call spikes (potential abuse)',
        'Month-end cost projection based on current burn',
      ]}
    />
  );
}
