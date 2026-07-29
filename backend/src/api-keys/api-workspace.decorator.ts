import { ExecutionContext, createParamDecorator } from '@nestjs/common';

/** The workspace id resolved by ApiKeyGuard from the presented API key. */
export const ApiWorkspaceId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest().apiWorkspaceId as string,
);
