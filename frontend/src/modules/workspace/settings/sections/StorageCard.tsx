import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { HardDrive } from 'lucide-react';

import { Glass } from '@/design-system';
import { formatBytes, storageApi } from '@/modules/workspace/api/storage';
import { cn } from '@/lib/utils';

/** Settings -> Data & privacy: how much of the plan's storage the practice uses, and on what. */
export function StorageCard({ isOwner }: { isOwner: boolean }) {
  const q = useQuery({ queryKey: ['workspace', 'storage'], queryFn: storageApi.summary, staleTime: 60_000 });
  const s = q.data;

  return (
    <Glass className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <HardDrive className="mt-0.5 h-5 w-5 flex-shrink-0 text-[hsl(var(--brand-blue))]" />
          <div>
            <div className="text-sm font-semibold text-foreground">Storage</div>
            <p className="mt-0.5 text-xs text-foreground/65">
              {!s
                ? q.isError ? "Couldn't load storage use." : 'Loading…'
                : s.limit == null
                  ? `${formatBytes(s.used)} used. Your plan has no storage limit.`
                  : `${formatBytes(s.used)} of ${formatBytes(s.limit)} used on the ${s.plan} plan.`}
            </p>
          </div>
        </div>
        {isOwner && s?.limit != null && (
          <Link
            to="/billing"
            className="inline-flex flex-shrink-0 items-center rounded-full border border-foreground/10 bg-card px-3 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.04]"
          >
            Need more space?
          </Link>
        )}
      </div>

      {s && s.limit != null && <UsageBar used={s.used} limit={s.limit} />}

      {s && s.breakdown.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-foreground/[0.06] pt-3">
          {s.breakdown.map((b) => (
            <li key={b.bucket} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-foreground/75">{b.label}</span>
              <span className="tabular-nums text-foreground/55">
                {b.files.toLocaleString('en-IN')} file{b.files === 1 ? '' : 's'} · {formatBytes(b.bytes)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {s && s.breakdown.length === 0 && (
        <p className="mt-3 text-xs text-foreground/50">No files stored yet.</p>
      )}
    </Glass>
  );
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const tone = pct < 80 ? 'ok' : pct < 100 ? 'warn' : 'full';
  return (
    <>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div
          className={cn(
            'h-full rounded-full',
            tone === 'ok' && 'bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]',
            tone === 'warn' && 'bg-amber-500',
            tone === 'full' && 'bg-rose-500',
          )}
          style={{ width: `${Math.max(pct, used > 0 ? 1 : 0)}%` }}
        />
      </div>
      {tone === 'warn' && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">You've used {pct}% of your storage.</p>}
      {tone === 'full' && (
        <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
          Storage is full. New uploads are paused until you delete files or upgrade.
        </p>
      )}
    </>
  );
}
