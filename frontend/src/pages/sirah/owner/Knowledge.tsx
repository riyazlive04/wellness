import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { HelpGuidesView } from '@/modules/workspace/knowledge/KnowledgeView';

/** Help & guides — search the NUSI guide and open the PDF user guides. */
export default function OwnerKnowledge() {
  const workspace = readWorkspace();
  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={null}
      topbarContext="Help & guides"
    >
      <HelpGuidesView />
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
