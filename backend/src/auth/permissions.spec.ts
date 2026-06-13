import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  computeEffectivePermissions,
} from './permissions';
import { RolesGuard } from './guards/roles.guard';
import { REQUIRE_PERMISSION_KEY } from './decorators/require-permission.decorator';
import type { AuthUser } from './types/auth-user.type';

describe('computeEffectivePermissions', () => {
  it('owner gets the full catalog', () => {
    expect(computeEffectivePermissions('owner').length).toBe(PERMISSIONS.length);
  });

  it('returns role defaults with no overrides', () => {
    expect(computeEffectivePermissions('receptionist')).toEqual(
      [...ROLE_PERMISSIONS.receptionist].sort(),
    );
  });

  it('a grant override adds a permission the role lacks', () => {
    const out = computeEffectivePermissions('support', [{ permission: 'ai.use', effect: 'grant' }]);
    expect(out).toContain('ai.use');
    expect(ROLE_PERMISSIONS.support).not.toContain('ai.use');
  });

  it('a deny override removes a role-default permission', () => {
    const out = computeEffectivePermissions('nutritionist', [{ permission: 'clients.write', effect: 'deny' }]);
    expect(out).not.toContain('clients.write');
    expect(out).toContain('clients.read');
  });

  it('ignores unknown permission strings in overrides', () => {
    const out = computeEffectivePermissions('coach', [{ permission: 'made.up', effect: 'grant' }]);
    expect(out).not.toContain('made.up');
  });

  it('null role yields no permissions', () => {
    expect(computeEffectivePermissions(null)).toEqual([]);
  });
});

describe('RolesGuard — @RequirePermission', () => {
  function ctx(user: Partial<AuthUser> | undefined) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as never;
  }

  function guardRequiring(perms: string[]): RolesGuard {
    const reflector = {
      getAllAndOverride: (key: string) => (key === REQUIRE_PERMISSION_KEY ? perms : undefined),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  const baseUser: AuthUser = {
    id: 'u1', jwtRole: 'authenticated', isSuperAdmin: false,
    workspaceId: 'ws1', workspaceRole: 'nutritionist',
    organizationId: null, organizationIds: [], organizationRoles: {},
    permissions: ['clients.read'], appRoles: [], isClient: false,
  };

  it('allows when the user holds the permission', () => {
    const g = guardRequiring(['clients.read']);
    expect(g.canActivate(ctx(baseUser))).toBe(true);
  });

  it('blocks when the permission is missing', () => {
    const g = guardRequiring(['clients.write']);
    expect(() => g.canActivate(ctx(baseUser))).toThrow(ForbiddenException);
  });

  it('super admin bypasses the permission check', () => {
    const g = guardRequiring(['billing.manage']);
    expect(g.canActivate(ctx({ ...baseUser, isSuperAdmin: true, permissions: [] }))).toBe(true);
  });

  it('org owner of the primary org bypasses', () => {
    const g = guardRequiring(['billing.manage']);
    const orgUser: AuthUser = {
      ...baseUser, permissions: [], organizationId: 'org1', organizationRoles: { org1: 'org_owner' },
    };
    expect(g.canActivate(ctx(orgUser))).toBe(true);
  });
});
