import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { AssistantChat } from '@/modules/assistant/AssistantChat';

/**
 * Clinical AI — the nutritionist/owner assistant (Module 6). The backend
 * resolves the assistant type from the caller's role, so this page just mounts
 * the shared chat surface inside the owner shell.
 */
export default function OwnerAIAssistant() {
  const workspace = readWorkspace();
  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={null}
      topbarContext="Nutritionist Assistant · grounded in your workspace"
    >
      <AssistantChat />
    </OwnerLayout>
  );
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName, initials };
}
