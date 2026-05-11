import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  data: T;
  meta: { requestId?: string };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(ctx: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const req = ctx.switchToHttp().getRequest();
    const requestId = req.id;
    return next.handle().pipe(
      map((body) => {
        if (body && typeof body === 'object' && 'data' in body) {
          return { ...(body as object), meta: { requestId, ...(body as { meta?: object }).meta } } as ApiResponse<T>;
        }
        return { data: body, meta: { requestId } };
      }),
    );
  }
}
