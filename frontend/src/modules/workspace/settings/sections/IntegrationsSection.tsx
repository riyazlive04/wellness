import { SectionHeader } from './GeneralSection';
import { ApiKeysPanel } from './ApiKeysPanel';
import { ConnectionsPanel } from './ConnectionsPanel';

/**
 * Settings → Integrations: what the practice connects itself — its own
 * WhatsApp number, and developer API keys on Scale Pro. NUSI's own platform
 * services (payments, AI, email…) are Sirah Digital's to run and stay out of
 * the practice's view.
 */
export function IntegrationsSection() {
  return (
    <SectionHeader
      title="Integrations"
      subtitle="Connect your practice's own WhatsApp number to send reminders and alerts from it."
    >
      <ConnectionsPanel />

      {/* Developer API keys (Scale Pro) */}
      <ApiKeysPanel />
    </SectionHeader>
  );
}
