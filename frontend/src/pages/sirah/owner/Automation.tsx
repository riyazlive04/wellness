import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { AutomationView } from '@/modules/automation/AutomationView';

/**
 * Automation page — wired to the real rule engine.
 *
 * Replaces the v1 mock UI. Rules persist to public.automation_rules; runs
 * persist to public.automation_runs; firing is driven by the EventBus
 * subscribing to ACTIVITY_RECORDED_EVENT.
 */
export default function OwnerAutomation() {
  const ws = readWorkspaceSummary();
  return (
    <OwnerLayout
      practiceName={ws.practiceName}
      ownerName={ws.ownerName}
      initials={ws.initials}
      trialDaysLeft={28}
      topbarContext="Workspace · Automation"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <AutomationView heroEyebrow="Workspace · Rules" />
      </div>
    </OwnerLayout>
  );
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }

function readWorkspaceSummary(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName, initials };
}
