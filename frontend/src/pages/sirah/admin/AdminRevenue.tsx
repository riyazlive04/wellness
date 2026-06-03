import { TrendingUp } from 'lucide-react';
import { PendingPage } from '@/modules/super-admin/components/PendingPage';

export default function AdminRevenue() {
  return (
    <PendingPage
      icon={TrendingUp}
      title="Revenue analytics"
      description="MRR/ARR trends, plan distribution, monthly cohorts, churn analysis."
      waitingOn="Razorpay (or Stripe) wiring + subscriptions table populated with real charges"
      willInclude={[
        'MRR + ARR trend lines across the last 12 months',
        'Revenue split by plan tier (Starter / Pro / Clinic / Enterprise)',
        'Monthly signup cohorts with retention curves',
        'Failed-payment + dunning queue with manual-retry tool',
        'GST-compliant invoice list with download + resend',
      ]}
    />
  );
}
