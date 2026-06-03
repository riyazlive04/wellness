import { Wallet } from 'lucide-react';
import { PendingPage } from '@/modules/super-admin/components/PendingPage';

export default function AdminBilling() {
  return (
    <PendingPage
      icon={Wallet}
      title="Billing"
      description="Payment history, invoices, refunds, dunning queue."
      waitingOn="Razorpay (or Stripe) webhooks wired to a payments + invoices table"
      willInclude={[
        'Payment history — every charge, refund, dispute, by workspace',
        'GST-compliant invoices — list, download PDF, resend',
        'Failed payments / dunning queue — manual retry, escalate',
        'Refund tool with reason codes',
      ]}
    />
  );
}
