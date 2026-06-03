import { CreditCard } from 'lucide-react';
import { PendingPage } from '@/modules/super-admin/components/PendingPage';

export default function AdminSubscriptions() {
  return (
    <PendingPage
      icon={CreditCard}
      title="Subscriptions"
      description="Every paying workspace, plan, status, next billing date, MRR contribution."
      waitingOn="Razorpay (or Stripe) connected + a subscriptions table tracking active/cancelled/past_due states"
      willInclude={[
        'List of every workspace subscription with plan + status + next-billing date',
        'Filter by status: trialing / active / past_due / cancelled',
        'Plan changes — upgrade/downgrade with prorated billing',
        'Cancellation reason capture for churn analysis',
        'Per-workspace MRR contribution',
      ]}
    />
  );
}
