import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { LimitsService } from '../tenancy/limits.service';
import { planHasFeature } from '../common/features';

/**
 * Authenticates a request by API key (header `X-API-Key: sk_live_…` or
 * `Authorization: Bearer sk_live_…`). On success, stamps the resolved workspace
 * onto the request. Also re-checks the plan still includes `api_access`, so a
 * downgrade below Scale Pro disables previously-issued keys.
 *
 * Used only on @Public() controllers (JwtAuthGuard is skipped there); the
 * global Roles/Features guards are no-ops on those routes (no metadata).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly limits: LimitsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const presented =
      (req.headers['x-api-key'] as string | undefined) ?? bearer(req.headers['authorization'] as string | undefined);

    const result = await this.keys.verify(String(presented ?? ''));
    if (!result) throw new UnauthorizedException('Invalid or missing API key.');

    const plan = await this.limits.resolvePlan(result.workspaceId);
    if (!planHasFeature(plan, 'api_access')) {
      throw new UnauthorizedException('API access is not available on this workspace plan.');
    }

    req.apiWorkspaceId = result.workspaceId;
    req.apiKeyId = result.keyId;
    return true;
  }
}

function bearer(header?: string): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1] : undefined;
}
