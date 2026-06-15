import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../permissions';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/**
 * Require the caller to hold ALL of the given fine-grained permissions in their
 * primary workspace. Checked by RolesGuard against AuthUser.permissions
 * (role defaults ± per-user overrides). Super admins and org owners/admins of
 * the parent org bypass, mirroring @WorkspaceRole.
 *
 * Example: @RequirePermission('clients.write')
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permissions);
