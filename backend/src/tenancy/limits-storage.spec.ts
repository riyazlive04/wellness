import { LimitsService, PlanLimitException, formatBytes } from './limits.service';

/**
 * Per-practice storage: measured across every bucket from storage.objects,
 * capped by the plan (trial 1 GB, Starter 5 GB, Growth 50 GB, Scale Pro 200 GB).
 */

const GB = 1024 ** 3;

function build(opts: { plan: string; buckets: Array<{ bucket: string; bytes: number; files: number }>; storageFails?: boolean }) {
  const prisma = {
    $queryRawUnsafe: jest.fn(async (sql: string) => {
      if (sql.includes('subscriptions')) return [{ plan: opts.plan, sub_plan: null }];
      if (sql.includes('storage.objects')) {
        if (opts.storageFails) throw new Error('permission denied for schema storage');
        return opts.buckets.map((b) => ({ bucket: b.bucket, bytes: BigInt(b.bytes), files: BigInt(b.files) }));
      }
      if (sql.includes('public.files')) return [{ bytes: BigInt(123), files: BigInt(1) }];
      return [];
    }),
  };
  return { svc: new LimitsService(prisma as never), prisma };
}

describe('LimitsService storage', () => {
  it('adds up every bucket and labels them for owners', async () => {
    const { svc } = build({
      plan: 'starter',
      buckets: [
        { bucket: 'client-files', bytes: 2 * GB, files: 40 },
        { bucket: 'progress-photos', bytes: GB / 2, files: 120 },
        { bucket: 'something-new', bytes: 10, files: 1 },
      ],
    });
    const s = await svc.storageSummary('ws-1');
    expect(s.used).toBe(2.5 * GB + 10);
    expect(s.limit).toBe(5 * GB);
    expect(s.breakdown.map((b) => b.label)).toEqual(['Client files & documents', 'Progress photos', 'Other files']);
  });

  it('matches files by practice, client, client user and staff user folders', async () => {
    const { svc, prisma } = build({ plan: 'starter', buckets: [] });
    await svc.storageBreakdown('ws-1');
    const sql = (prisma.$queryRawUnsafe.mock.calls.find((c) => String(c[0]).includes('storage.objects')) ?? [''])[0] as string;
    expect(sql).toContain('FROM public.clients WHERE workspace_id');
    expect(sql).toContain('user_id::text FROM public.clients');
    expect(sql).toContain('FROM public.workspace_members');
    expect(sql).toContain("'verification'");
  });

  it('blocks a new upload only once the practice is full', async () => {
    await expect(build({ plan: 'starter', buckets: [{ bucket: 'client-files', bytes: 5 * GB - 1, files: 1 }] }).svc.assertStorageAvailable('ws-1')).resolves.toBeUndefined();
    await expect(build({ plan: 'starter', buckets: [{ bucket: 'client-files', bytes: 5 * GB, files: 1 }] }).svc.assertStorageAvailable('ws-1')).rejects.toBeInstanceOf(PlanLimitException);
  });

  it('rejects a recorded file that would go over the plan', async () => {
    const { svc } = build({ plan: 'starter', buckets: [{ bucket: 'client-files', bytes: 5 * GB - 100, files: 1 }] });
    await expect(svc.assertStorageQuota('ws-1', 50)).resolves.toBeUndefined();
    await expect(svc.assertStorageQuota('ws-1', 200)).rejects.toBeInstanceOf(PlanLimitException);
  });

  it('says the limit in GB, not raw bytes', async () => {
    const { svc } = build({ plan: 'starter', buckets: [{ bucket: 'client-files', bytes: 5 * GB, files: 1 }] });
    const err = await svc.assertStorageAvailable('ws-1').catch((e) => e);
    expect((err as PlanLimitException).message).toMatch(/used its 5 GB of storage on the starter plan/);
  });

  it('falls back to the file vault if storage.objects is unreadable', async () => {
    const { svc } = build({ plan: 'starter', buckets: [], storageFails: true });
    expect(await svc.storageUsageBytes('ws-1')).toBe(123);
  });

  it('formats sizes for people', () => {
    expect(formatBytes(5 * GB)).toBe('5 GB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(97)).toBe('97 bytes');
  });
});
