import { SetMetadata } from '@nestjs/common';
import { WorkspaceMemberRole } from '../types/auth-user.type';

export const WORKSPACE_ROLE_KEY = 'requireWorkspaceRole';

/**
 * Require the calling user to have at least one of the given workspace roles
 * inside their primary workspace.
 *
 * Example: @WorkspaceRole('owner', 'nutritionist') — owners and nutritionists
 * pass; receptionists/coaches/support get a 403.
 *
 * Super admins bypass this guard (they can act in any workspace).
 */
export const WorkspaceRole = (...roles: WorkspaceMemberRole[]) =>
  SetMetadata(WORKSPACE_ROLE_KEY, roles);
