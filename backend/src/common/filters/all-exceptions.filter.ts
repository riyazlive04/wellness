import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
  meta: { requestId?: string };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const requestId = (req as Request & { id?: string }).id;
    const { status, body } = this.toErrorResponse(exception, requestId);

    if (status >= 500) {
      const detail =
        exception instanceof Error
          ? exception.stack
          : typeof exception === 'object' && exception !== null
            ? JSON.stringify(exception)
            : String(exception);
      this.logger.error(`${req.method} ${req.url} → ${status} (${body.error.code})`, detail);
    }

    res.status(status).json(body);
  }

  private toErrorResponse(
    e: unknown,
    requestId?: string,
  ): { status: number; body: ErrorBody } {
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse();
      const message = typeof r === 'string' ? r : (r as { message?: string }).message ?? e.message;
      const details = typeof r === 'object' ? (r as { message?: unknown }).message : undefined;
      return {
        status,
        body: {
          error: { code: this.codeFor(status), message, details },
          meta: { requestId },
        },
      };
    }

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          body: {
            error: { code: 'UNIQUE_CONSTRAINT', message: 'Resource already exists' },
            meta: { requestId },
          },
        };
      }
      if (e.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          body: {
            error: { code: 'NOT_FOUND', message: 'Resource not found' },
            meta: { requestId },
          },
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
        meta: { requestId },
      },
    };
  }

  private codeFor(status: number): string {
    switch (status) {
      case 400: return 'BAD_REQUEST';
      case 401: return 'UNAUTHORIZED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 422: return 'VALIDATION_FAILED';
      case 429: return 'RATE_LIMITED';
      default: return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
    }
  }
}
