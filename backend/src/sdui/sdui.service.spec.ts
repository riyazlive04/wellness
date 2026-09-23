import { Test, type TestingModule } from '@nestjs/testing';

import { PrismaService } from '../database/prisma.service';
import { defaultScreen } from './sdui.defaults';
import { SduiService } from './sdui.service';
import { SCREEN_KEYS } from './sdui.types';

/**
 * The ETag contract between `GET /me/ui` and `GET /me/ui/revision`.
 *
 * These two endpoints compute the same hash by different routes: the bundle
 * builds the payload, the revision probe reads only the inputs. If they ever
 * disagree, the client's "your app has been updated" banner never clears —
 * it applies the update, re-polls, sees a different hash again, and offers the
 * same update forever. That is the failure this file exists to prevent.
 *
 * DB reads are mocked by inspecting the SQL, matching the house style in
 * tenancy/limits.service.spec.ts.
 */
function makePrisma(opts: {
  workspaceId?: string | null;
  plan?: string;
  /** screen → published revision. The tree itself is the stock default. */
  published?: Partial<Record<string, number>>;
}) {
  const workspaceId = opts.workspaceId === undefined ? 'ws-1' : opts.workspaceId;
  const published = opts.published ?? {};

  return {
    $queryRawUnsafe: jest.fn((sql: string) => {
      if (sql.includes('FROM public.clients')) {
        return Promise.resolve([{ workspace_id: workspaceId }]);
      }
      // Plan resolution (billing/resolve-plan).
      if (sql.includes('subscriptions')) {
        return Promise.resolve([{ plan: opts.plan ?? 'growth', sub_plan: null }]);
      }
      if (sql.includes('workspace_ui_layouts')) {
        const rows = Object.entries(published).map(([screen, revision]) => ({
          screen,
          published: defaultScreen(screen as (typeof SCREEN_KEYS)[number]),
          published_revision: revision,
          schema_version: 1,
        }));
        return Promise.resolve(rows);
      }
      return Promise.resolve([]);
    }),
  };
}

async function makeService(prisma: ReturnType<typeof makePrisma>): Promise<SduiService> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [SduiService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return moduleRef.get(SduiService);
}

describe('SduiService ETag', () => {
  it('the bundle and the revision probe agree', async () => {
    const opts = { plan: 'growth', published: { home: 3, more: 1 } };

    const bundle = await (await makeService(makePrisma(opts))).bundleForUser('u1');
    const probe = await (await makeService(makePrisma(opts))).revisionForUser('u1');

    expect(probe.etag).toBe(bundle.etag);
    expect(probe.version).toBe(bundle.version);
  });

  it('agrees for a client with no workspace yet', async () => {
    const opts = { workspaceId: null };

    const bundle = await (await makeService(makePrisma(opts))).bundleForUser('u1');
    const probe = await (await makeService(makePrisma(opts))).revisionForUser('u1');

    expect(probe.etag).toBe(bundle.etag);
  });

  it('agrees for a workspace that has published nothing', async () => {
    const bundle = await (await makeService(makePrisma({}))).bundleForUser('u1');
    const probe = await (await makeService(makePrisma({}))).revisionForUser('u1');

    expect(probe.etag).toBe(bundle.etag);
  });

  it('changes when a screen is published again', async () => {
    const before = await (
      await makeService(makePrisma({ published: { home: 3 } }))
    ).revisionForUser('u1');
    const after = await (
      await makeService(makePrisma({ published: { home: 4 } }))
    ).revisionForUser('u1');

    expect(after.etag).not.toBe(before.etag);
  });

  it('changes when a screen is unpublished', async () => {
    const withHome = await (
      await makeService(makePrisma({ published: { home: 3, more: 1 } }))
    ).revisionForUser('u1');
    const without = await (
      await makeService(makePrisma({ published: { more: 1 } }))
    ).revisionForUser('u1');

    expect(without.etag).not.toBe(withHome.etag);
  });

  it('changes when the plan changes, because pruning does', async () => {
    const growth = await (
      await makeService(makePrisma({ plan: 'growth', published: { home: 1 } }))
    ).revisionForUser('u1');
    const starter = await (
      await makeService(makePrisma({ plan: 'starter', published: { home: 1 } }))
    ).revisionForUser('u1');

    expect(starter.etag).not.toBe(growth.etag);
  });

  it('is stable regardless of the order Postgres returns rows in', async () => {
    const a = await (
      await makeService(makePrisma({ published: { home: 2, more: 5, tabs: 1 } }))
    ).revisionForUser('u1');
    const b = await (
      await makeService(makePrisma({ published: { tabs: 1, home: 2, more: 5 } }))
    ).revisionForUser('u1');

    expect(b.etag).toBe(a.etag);
  });
});

describe('SduiService bundle', () => {
  it('serves every screen, falling back to defaults for the unpublished ones', async () => {
    const service = await makeService(makePrisma({ published: { home: 2 } }));
    const bundle = await service.bundleForUser('u1');

    for (const key of SCREEN_KEYS) {
      expect(bundle.screens[key]).toBeDefined();
      expect(bundle.screens[key]!.root).toBeDefined();
    }
  });

  it('carries the published revision through to the client', async () => {
    const service = await makeService(makePrisma({ published: { home: 7 } }));
    const bundle = await service.bundleForUser('u1');

    expect(bundle.screens.home!.revision).toBe(7);
  });

  it('drops plan-gated rows a Starter workspace has not paid for', async () => {
    const service = await makeService(makePrisma({ plan: 'starter' }));
    const bundle = await service.bundleForUser('u1');

    // Community is gated on the `community` feature, which Starter lacks.
    expect(JSON.stringify(bundle.screens.more)).not.toContain('Community');
  });
});

describe('SduiService when the layouts table is missing', () => {
  /**
   * A backend deploy can land in an environment the migration has not reached.
   * The endpoint must serve the built-in layouts rather than 500 on every
   * request — a workspace that has published nothing sees exactly that anyway.
   */
  function makeBrokenPrisma() {
    return {
      $queryRawUnsafe: jest.fn((sql: string) => {
        if (sql.includes('FROM public.clients')) {
          return Promise.resolve([{ workspace_id: 'ws-1' }]);
        }
        if (sql.includes('subscriptions')) {
          return Promise.resolve([{ plan: 'growth', sub_plan: null }]);
        }
        if (sql.includes('workspace_ui_layouts')) {
          return Promise.reject(
            new Error('relation "public.workspace_ui_layouts" does not exist'),
          );
        }
        return Promise.resolve([]);
      }),
    };
  }

  it('serves every screen instead of throwing', async () => {
    const service = await makeService(makeBrokenPrisma());
    const bundle = await service.bundleForUser('u1');

    for (const key of SCREEN_KEYS) expect(bundle.screens[key]).toBeDefined();
  });

  it('the revision probe degrades the same way, so the hashes still agree', async () => {
    const bundle = await (await makeService(makeBrokenPrisma())).bundleForUser('u1');
    const probe = await (await makeService(makeBrokenPrisma())).revisionForUser('u1');

    // If these diverged, a client would be told an update was available, apply
    // it, and be told again — forever.
    expect(probe.etag).toBe(bundle.etag);
  });

  it('warns once, not once per request', async () => {
    const service = await makeService(makeBrokenPrisma());
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    for (let i = 0; i < 5; i++) await service.bundleForUser('u1');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('workspace_ui_layouts');
    warn.mockRestore();
  });
});
