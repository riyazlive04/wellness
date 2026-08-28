import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KnowledgeView } from '@/modules/workspace/knowledge/KnowledgeView';

/**
 * Knowledge base — the retrieval-backed assistant.
 *
 * Distinct from the AI Assistant page: that one reasons over live workspace
 * data (today's appointments, clients needing attention). This one answers
 * from documents you have uploaded and cites the passage it used. Different
 * question, different source of truth, so a separate destination rather than
 * a mode toggle inside the other.
 */
export default function OwnerKnowledge() {
  const workspace = readWorkspace();
  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={null}
      topbarContext="Knowledge base · answers cited from your documents"
    >
      <KnowledgeView />
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
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'NU';
  return { practiceName, ownerName, initials };
}
