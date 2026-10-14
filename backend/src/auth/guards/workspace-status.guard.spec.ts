import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../types/auth-user.type';
import { WorkspaceStatusGuard, WorkspaceUnavailableException } from './workspace-status.guard';

function ctx(user: Partial<AuthUser> | undefined, url: string, isPublic = false): { guard: WorkspaceStatusGuard; context: ExecutionContext } {
  const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
  const context = {
    getType: () => 'http',
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user, originalUrl: url }) }),
  } as unknown as ExecutionContext;
  return { guard: new WorkspaceStatusGuard(reflector), context };
}

const member = (status: AuthUser['workspaceStatus'], extra: Partial<AuthUser> = {}): Partial<AuthUser> => ({
  id: 'u1',
  workspaceId: 'w1',
  isSuperAdmin: false,
  isClient: false,
  workspaceStatus: status,
  ...extra,
});

describe('WorkspaceStatusGuard', () => {
  it('lets an active workspace through', () => {
    const { guard, context } = ctx(member('active'), '/api/v1/clients');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('locks staff of a suspended workspace', () => {
    const { guard, context } = ctx(member('suspended'), '/api/v1/clients');
    expect(() => guard.canActivate(context)).toThrow(WorkspaceUnavailableException);
  });

  it('locks clients of a deleted workspace too', () => {
    const { guard, context } = ctx(member('deleted', { isClient: true }), '/api/v1/me/home');
    expect(() => guard.canActivate(context)).toThrow(WorkspaceUnavailableException);
  });

  it('never locks a super admin', () => {
    const { guard, context } = ctx(member('suspended', { isSuperAdmin: true }), '/api/v1/clients');
    expect(guard.canActivate(context)).toBe(true);
  });

  it.each(['/api/v1/auth/me/scope', '/api/v1/workspaces/me', '/api/v1/workspaces/me/data/export', '/api/v1/health'])(
    'keeps %s open so the locked screen can render',
    (url) => {
      const { guard, context } = ctx(member('suspended'), url);
      expect(guard.canActivate(context)).toBe(true);
    },
  );

  it('does not treat workspaces/me/clients as open', () => {
    const { guard, context } = ctx(member('suspended'), '/api/v1/workspaces/me/clients');
    expect(() => guard.canActivate(context)).toThrow(WorkspaceUnavailableException);
  });

  it('skips public routes and signed-out requests', () => {
    expect(ctx(member('suspended'), '/api/v1/clients', true).guard.canActivate(ctx(member('suspended'), '/api/v1/clients', true).context)).toBe(true);
    const anon = ctx(undefined, '/api/v1/clients');
    expect(anon.guard.canActivate(anon.context)).toBe(true);
  });
});
