import { Database } from 'lucide-react';
import { PendingPage } from '@/modules/super-admin/components/PendingPage';

export default function AdminHealth() {
  return (
    <PendingPage
      icon={Database}
      title="Platform health"
      description="API latency, error rate, DB connections, queue depth — live operational visibility."
      waitingOn="A metrics agent — Sentry / Datadog / self-hosted Prometheus + Grafana"
      willInclude={[
        'API health — endpoint latencies (p50 / p95 / p99), 5xx rate, request volume',
        'DB health — connection pool, query latency, table sizes',
        'Queue health — BullMQ depth + failed jobs (once async jobs are added)',
        'Error log with deduplication and stack traces',
        'Backup status — last DB snapshot, retention, restore-test cadence',
      ]}
    />
  );
}
