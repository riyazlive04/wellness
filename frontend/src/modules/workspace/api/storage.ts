import { toast } from 'sonner';

import { api } from '@/lib/api';

/** One kind of stored file (a storage bucket), as the owner would name it. */
export interface StorageBucketUsage {
  bucket: string;
  label: string;
  bytes: number;
  files: number;
}

/** The practice's storage: used vs its plan's allowance (null = unlimited). */
export interface StorageSummary {
  plan: string;
  used: number;
  limit: number | null;
  breakdown: StorageBucketUsage[];
}

export const storageApi = {
  summary: () => api.get<StorageSummary>('/api/v1/workspaces/me/storage'),
};

/** 5368709120 -> "5 GB", 1536 -> "1.5 KB". Matches the backend's wording. */
export function formatBytes(n: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v : Math.round(v * 10) / 10} ${units[i]}`;
}

/**
 * Check there's room before uploading straight to storage from the browser
 * (uploads that go through the backend are checked there). Shows the reason
 * and returns false when the practice has used its plan's storage. If the
 * check itself fails, the upload goes ahead rather than blocking the user.
 */
export async function ensureStorageRoom(incomingBytes = 0): Promise<boolean> {
  try {
    const s = await storageApi.summary();
    if (s.limit != null && s.used + incomingBytes > s.limit) {
      toast.error('Storage full', {
        description: `Your practice has used its ${formatBytes(s.limit)} of storage on the ${s.plan} plan. Delete files you no longer need, or upgrade for more space.`,
        action: { label: 'See plans', onClick: () => { window.location.href = '/billing'; } },
        duration: 10_000,
      });
      return false;
    }
  } catch { /* don't block an upload because the check failed */ }
  return true;
}
