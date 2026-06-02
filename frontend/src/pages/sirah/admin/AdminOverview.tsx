import { motion } from 'framer-motion';
import { Building2, Users, CreditCard, Sparkles, Activity, Server } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { useScope } from '@/hooks/useScope';

/**
 * Placeholder Super Admin overview. Real KPIs (total workspaces, revenue,
 * AI usage, payment failures) wire up once the platform-admin API
 * endpoints land. For now this is the visible front door so the layout
 * + RBAC plumbing can be smoke-tested.
 */
export default function AdminOverview() {
  const { data: scope } = useScope();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="space-y-10"
      >
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/60">
            Platform overview
          </span>
          <h1 className="text-balance">SIRAH Platform · all workspaces.</h1>
          <p className="text-pretty text-base text-foreground/65 md:text-lg md:leading-relaxed">
            Signed in as <span className="font-medium text-foreground">{scope?.email ?? '—'}</span>.
            You have super admin access to the entire SIRAH LIFE ecosystem. Real metrics
            wire up once the platform-admin endpoints are migrated off Supabase Edge Functions.
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <PlaceholderTile icon={Building2}  label="Workspaces"        hint="active · suspended · trial" />
          <PlaceholderTile icon={Users}      label="Total users"       hint="owners + members + clients" />
          <PlaceholderTile icon={CreditCard} label="MRR"               hint="across all paid workspaces" />
          <PlaceholderTile icon={Sparkles}   label="AI usage today"    hint="GPT · Voice · Plate Vision" />
          <PlaceholderTile icon={Activity}   label="Trial conversion"  hint="last 30 days" />
          <PlaceholderTile icon={Server}     label="Platform health"   hint="API latency · DB · queues" />
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="p-6">
            <h2 className="text-lg font-semibold tracking-tight">What lives here next</h2>
            <ul className="mt-3 space-y-2 text-sm text-foreground/70">
              <li>• Workspaces list — view / suspend / activate / delete / plan changes</li>
              <li>• Subscriptions monitoring — payment status, GST invoices, failed-payment recovery</li>
              <li>• AI usage analytics — per-workspace token / image / minute spend</li>
              <li>• Audit log — every super-admin action recorded</li>
              <li>• Platform health — API latency, Postgres conn pool, worker queues</li>
            </ul>
          </Glass>
        </motion.div>
      </motion.div>
    </div>
  );
}

function PlaceholderTile({
  icon: Icon,
  label,
  hint,
}: {
  icon: typeof Building2;
  label: string;
  hint: string;
}) {
  return (
    <Glass className="p-6">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
        <Icon className="h-4 w-4 text-violet-300" />
      </div>
      <div className="mt-4 text-4xl font-semibold leading-none tracking-tight tabular-nums text-foreground/55">
        —
      </div>
      <div className="mt-1.5 text-xs text-foreground/55">{hint}</div>
    </Glass>
  );
}
