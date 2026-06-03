import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMetadata {
  /** Dot-separated action name. Convention: `<resource>.<verb>`. */
  action: string;
  /** Resource type for the audit row. e.g. `workspace`, `user`. */
  resourceType?: string;
  /** Path-segment name to lift as the resource id (e.g. 'id' for `:id`). */
  resourceIdParam?: string;
}

/**
 * Mark a controller handler for audit logging. The interceptor reads this
 * metadata and writes a row to public.admin_audit_log after a successful
 * response. Only marked handlers are logged — GETs and other noise stay out.
 *
 * Examples:
 *   @Audit({ action: 'workspace.suspend', resourceType: 'workspace', resourceIdParam: 'id' })
 *   @Audit({ action: 'super_admin.grant', resourceType: 'user' })
 */
export const Audit = (meta: AuditMetadata) => SetMetadata(AUDIT_KEY, meta);
