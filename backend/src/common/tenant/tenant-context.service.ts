import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  workspaceId: string | null;
  userId: string | null;
  isSuperAdmin: boolean;
}

/**
 * Per-request tenant scope. Populated by TenantMiddleware near the top of
 * every request and read anywhere downstream (services, repositories,
 * Prisma extension) without threading workspaceId through method params.
 *
 * Backed by AsyncLocalStorage — survives across `await` boundaries.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  /** Run `fn` with the given tenant store as ambient context. */
  run<T>(store: TenantStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  /** Current store. null if called outside a request. */
  store(): TenantStore | null {
    return this.als.getStore() ?? null;
  }

  /** Convenience — workspaceId or null. */
  workspaceId(): string | null {
    return this.als.getStore()?.workspaceId ?? null;
  }

  /** Convenience — throws if no workspaceId. Use in tenant-only code paths. */
  requireWorkspaceId(): string {
    const id = this.workspaceId();
    if (!id) {
      throw new Error(
        'TenantContext: workspaceId required but none set. Either the route is missing @WorkspaceRole/@CurrentWorkspace, or the caller has no workspace membership.',
      );
    }
    return id;
  }

  userId(): string | null {
    return this.als.getStore()?.userId ?? null;
  }

  isSuperAdmin(): boolean {
    return this.als.getStore()?.isSuperAdmin ?? false;
  }
}
