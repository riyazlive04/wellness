import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

/**
 * Opens an AsyncLocalStorage context for the entire request with an
 * empty/null tenant store. JwtStrategy.validate() (which runs INSIDE this
 * async context, after auth guard kicks in) mutates the store with the
 * resolved workspaceId / userId / isSuperAdmin.
 *
 * Why not just populate here? — NestJS middleware runs BEFORE guards, so
 * req.user is undefined when the middleware fires. The mutate-from-strategy
 * pattern lets us still benefit from AsyncLocalStorage (no need to thread
 * params through every method) while respecting the request lifecycle.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenant: TenantContextService) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    this.tenant.run(
      { workspaceId: null, userId: null, isSuperAdmin: false },
      () => next(),
    );
  }
}
