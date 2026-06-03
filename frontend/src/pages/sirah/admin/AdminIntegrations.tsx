import { Plug } from 'lucide-react';
import { PendingPage } from '@/modules/super-admin/components/PendingPage';

export default function AdminIntegrations() {
  return (
    <PendingPage
      icon={Plug}
      title="Integrations health"
      description="Live status of every external service — last successful call, error rate, latency."
      waitingOn="Each integration provisioned: Evolution API (WhatsApp), Razorpay, transactional email, error tracking"
      willInclude={[
        'WhatsApp gateway — Evolution API connection status, last message delivered',
        'Razorpay — last successful webhook, today\'s charges, failed-payment count',
        'Gemini AI — last call latency, 5xx rate, today\'s spend',
        'Supabase Auth — sign-ins today, JWT validation health',
        'Email provider (when added) — bounce rate, delivery rate',
      ]}
    />
  );
}
