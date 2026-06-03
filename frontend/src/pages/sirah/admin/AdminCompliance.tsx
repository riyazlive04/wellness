import { AlertTriangle } from 'lucide-react';
import { PendingPage } from '@/modules/super-admin/components/PendingPage';

export default function AdminCompliance() {
  return (
    <PendingPage
      icon={AlertTriangle}
      title="Compliance"
      description="KYC review queue, content moderation, GDPR data-export requests, legal docs versioning."
      waitingOn="Decisions on KYC verification provider (e.g. SignDesk, Veriff) + content-moderation policies"
      willInclude={[
        'KYC review queue — workspaces awaiting GSTIN/PAN verification',
        'Content moderation — flagged community posts, reported clients',
        'Data export requests — handle GDPR "give me my data" requests',
        'DPA / legal docs — version control for ToS, Privacy Policy, DPA templates',
        'Right-to-be-forgotten — hard delete with audit log entry',
      ]}
    />
  );
}
