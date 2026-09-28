import { ForbiddenException } from '@nestjs/common';
import { WorkspacesController } from './workspaces.controller';
import { AuthUser } from '../auth/types/auth-user.type';
import { TOPUPS } from '../billing/plans';

/**
 * Without a paid subscription a workspace's plan falls back to the
 * workspaces.plan column, so letting an owner write that column handed out
 * any plan for free. Only billing (or a super admin) may set it.
 */

function build() {
  const updates: unknown[] = [];
  const creates: unknown[] = [];
  const workspaces = {
    getForUser: async () => ({ id: 'ws-1', plan: 'trial' }),
    update: async (_id: string, dto: unknown) => (updates.push(dto), { id: 'ws-1' }),
    createForOwner: async (_uid: string, dto: unknown) => (creates.push(dto), { id: 'ws-1' }),
  };
  const controller = new WorkspacesController(workspaces as never, {} as never, {} as never, {} as never);
  return { controller, updates, creates };
}

const owner = { id: 'u-1', isSuperAdmin: false } as AuthUser;
const superAdmin = { id: 'u-2', isSuperAdmin: true } as AuthUser;

describe('WorkspacesController plan changes', () => {
  it('refuses an owner setting their own plan', async () => {
    const { controller, updates } = build();
    await expect(controller.updateMe(owner, { plan: 'scale_pro' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(updates).toHaveLength(0);
  });

  it('still saves an owner\'s ordinary settings', async () => {
    const { controller, updates } = build();
    await controller.updateMe(owner, { name: 'Sirah Nutrition' });
    expect(updates).toEqual([{ name: 'Sirah Nutrition' }]);
  });

  it('lets a super admin set a plan (e.g. a complimentary account)', async () => {
    const { controller, updates } = build();
    await controller.updateMe(superAdmin, { plan: 'growth' });
    expect(updates).toEqual([{ plan: 'growth' }]);
  });

  it('refuses a plan when an owner creates their workspace', async () => {
    const { controller, creates } = build();
    await expect(controller.create(owner, { name: 'Practice', plan: 'scale_pro' } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(creates).toHaveLength(0);
  });

  it('creates a workspace normally without a plan', async () => {
    const { controller, creates } = build();
    await controller.create(owner, { name: 'Practice' } as never);
    expect(creates).toHaveLength(1);
  });
});

describe('Top-up catalog', () => {
  it('only sells packs that the payment webhook actually grants (AI credits)', () => {
    expect(TOPUPS.length).toBeGreaterThan(0);
    for (const t of TOPUPS) expect(t.unitLabel).toBe('credits');
  });
});
