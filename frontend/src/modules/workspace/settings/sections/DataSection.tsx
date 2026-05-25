import { Download, FileArchive, Trash2, ShieldAlert, ScrollText } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { SectionHeader } from './GeneralSection';

export function DataSection() {
  return (
    <SectionHeader
      title="Data & privacy"
      subtitle="Export your workspace, configure retention, and (last resort) delete your workspace."
    >
      {/* Export */}
      <Glass className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15 text-violet-200">
            <FileArchive className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-foreground">Export workspace data</h3>
            <p className="mt-1 text-xs text-foreground/55">
              A signed ZIP with clients, programs, messages, assessments, meal logs, and audit records.
              Delivered to your email within ~15 minutes for large workspaces.
            </p>
          </div>
          <button
            type="button"
            onClick={() => toast.success('Export queued — you\'ll get an email with a download link.')}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-1.5 text-xs font-medium text-foreground hover:scale-[1.02]"
          >
            <Download className="h-3.5 w-3.5" />
            Generate export
          </button>
        </div>
      </Glass>

      {/* Retention */}
      <Glass className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-300/20 to-amber-300/[0.05] text-amber-200">
            <ScrollText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-foreground">Retention policy</h3>
            <p className="mt-1 text-xs text-foreground/55">
              Inactive client records are anonymized after 24 months by default. Messages and audit logs
              follow a 7-year retention to meet Indian healthcare recordkeeping rules.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <RetentionTile label="Client records"   value="24 months" />
              <RetentionTile label="Messages + audit" value="7 years" />
              <RetentionTile label="Backups"          value="90 days" />
            </div>
          </div>
        </div>
      </Glass>

      {/* GDPR / DPDP */}
      <Glass className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-400/20 to-emerald-400/[0.05] text-emerald-200">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-foreground">Client data requests</h3>
            <p className="mt-1 text-xs text-foreground/55">
              Process client-initiated data export or deletion requests (GDPR / India's DPDP Act).
              Requests respond within 30 days as required by law.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toast('Request log opens — currently 0 open requests.')}
                className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[11px] text-foreground/85 hover:bg-foreground/[0.06]"
              >
                View request log
              </button>
              <button
                type="button"
                onClick={() => toast('Open the Clients module → pick a client → Actions → "Process data request".')}
                className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[11px] text-foreground/85 hover:bg-foreground/[0.06]"
              >
                Process a request
              </button>
            </div>
          </div>
        </div>
      </Glass>

      {/* Danger zone */}
      <Glass className="border-rose-400/15 bg-rose-400/[0.03] p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-rose-400/15 text-rose-300">
            <Trash2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-rose-100">Delete workspace</h3>
              <span className="rounded-full border border-rose-400/30 bg-rose-400/[0.1] px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-rose-200">
                Permanent
              </span>
            </div>
            <p className="mt-1 text-xs text-foreground/55">
              Cancels subscription and schedules irreversible deletion of all workspace data after a
              30-day grace period. Cannot be recovered after grace ends.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              toast('Confirmation dialog with type-to-confirm field opens here. Not destructive in the demo.')
            }
            className="rounded-full border border-rose-400/40 bg-rose-400/[0.06] px-4 py-2 text-xs font-medium text-rose-100 hover:bg-rose-400/[0.1]"
          >
            Delete workspace
          </button>
        </div>
      </Glass>
    </SectionHeader>
  );
}

function RetentionTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
