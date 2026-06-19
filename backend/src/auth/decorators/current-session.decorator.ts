import { ExecutionContext, createParamDecorator } from '@nestjs/common';

/**
 * The Supabase `session_id` claim of the request's access token.
 *
 * We decode it fresh from the bearer token (NOT from req.user) because
 * JwtStrategy caches the resolved AuthUser per-userId — so a cached user
 * could carry another device's session_id. The token itself is already
 * verified by the global JWT guard, so a plain base64 decode is safe here.
 */
export const CurrentSessionId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | null => {
    const auth = ctx.switchToHttp().getRequest().headers?.authorization as string | undefined;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) return null;
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString('utf8'),
      );
      return (payload.session_id as string) ?? null;
    } catch {
      return null;
    }
  },
);
