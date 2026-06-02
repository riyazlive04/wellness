import { SetMetadata } from '@nestjs/common';

export const SUPER_ADMIN_KEY = 'requireSuperAdmin';

/**
 * Restrict a route to super_admin users (Sirah Digital internal team).
 * Use SPARINGLY — only platform-management endpoints belong here.
 */
export const SuperAdmin = () => SetMetadata(SUPER_ADMIN_KEY, true);
