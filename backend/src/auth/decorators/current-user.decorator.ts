import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthUser } from '../types/auth-user.type';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user as AuthUser;
  },
);
