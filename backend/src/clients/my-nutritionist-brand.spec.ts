import { ClientsService } from './clients.service';
import type { PrismaService } from '../database/prisma.service';

/**
 * A deleted practice must stop branding its clients' apps.
 *
 * The client app themes itself from this one endpoint: primary, accent, the
 * CTA gradient and the active tab tint all come from here. Without a status
 * filter the palette outlives the practice, so a client of a workspace deleted
 * months ago still opens the app in that practice's colours with no way back
 * to ours - which is exactly what happened to Sirah Nutrition.
 *
 * The filter lives inside a raw SQL string, where neither the compiler nor the
 * linter would notice it being dropped. Hence a test on the SQL itself.
 *
 * ClientsService takes twelve constructor dependencies and this method needs
 * one, so the method is invoked against a minimal `this` rather than building
 * the whole service. No DB is touched.
 */

const WS = '33333333-3333-4333-8333-333333333333';
const USER = '11111111-1111-4111-8111-111111111111';

/** The workspace row shape the method selects. */
const branded = {
  id: WS,
  name: 'Sirah Nutrition',
  display_name: null,
  logo_url: 'https://example.test/logo.png',
  tagline: null,
  brand_color: '#5EEAD4',
  brand_accent: '#60A5FA',
  white_label: false,
  plan: 'starter',
};

/**
 * `workspaceRows` is what the workspace SELECT returns - pass [] to stand for
 * a row the status filter excluded.
 */
function call(workspaceRows: unknown[]) {
  const sqls: string[] = [];
  const prisma = {
    $queryRawUnsafe: jest.fn(async (sql: string, ..._args: unknown[]) => {
      sqls.push(sql);
      if (/FROM public\.clients/i.test(sql)) return [{ workspace_id: WS }];
      if (/FROM public\.workspaces/i.test(sql)) return workspaceRows;
      // Logo fallback and white-label entitlement lookups: nothing to add.
      return [];
    }),
  } as unknown as PrismaService;

  const ctx = { prisma } as unknown as ClientsService;
  const result = ClientsService.prototype.myNutritionist.call(ctx, USER);
  return { result, sqls };
}

describe('myNutritionist - practice branding', () => {
  it('asks the database only for a workspace that is not deleted', async () => {
    const { result, sqls } = call([branded]);
    await result;

    const workspaceSql = sqls.find((s) => /FROM public\.workspaces/i.test(s));
    expect(workspaceSql).toBeDefined();
    // The guard itself. Whitespace-tolerant, so reformatting the query does
    // not fail the test, but the filter has to be present.
    expect(workspaceSql!.replace(/\s+/g, ' ')).toMatch(/status\s*<>\s*'deleted'/);
  });

  it('falls back to our own branding when the practice row is gone', async () => {
    // [] is what the filtered query returns for a deleted practice.
    const out = await call([]).result;

    expect(out.brand_color).toBeNull();
    expect(out.brand_accent).toBeNull();
    expect(out.white_label).toBe(false);
    expect(out.name).toBe('Your nutritionist');
  });

  it('still serves the palette for a practice that is not deleted', async () => {
    const out = await call([branded]).result;

    expect(out.brand_color).toBe('#5EEAD4');
    expect(out.brand_accent).toBe('#60A5FA');
    expect(out.name).toBe('Sirah Nutrition');
  });
});
