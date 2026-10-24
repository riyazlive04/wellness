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
  error: {
    code: string;
    message: string;
    details?: unknown;
    /**
     * Anything else the exception put on its response, minus the keys already
     * mapped above. A plan-limit refusal carries resource / limit / used /
     * plan, and without this the browser could only show the sentence - never
     * "100 of 100 clients on Starter" or a button to the right plan.
     */
    context?: Record<string, unknown>;
  };
  meta: { requestId?: string };
}

/** Keys the error envelope maps itself; everything else becomes `context`. */
const MAPPED_KEYS = new Set(['statusCode', 'error', 'code', 'message']);

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
      // Keep a machine-readable code the exception set itself (e.g. 'ai_key_missing').
      const own = typeof r === 'object' ? (r as { code?: unknown }).code : undefined;
      // Carry the exception's own structured fields through. A 402 that says
      // only "limit reached" forces the browser to parse English to find out
      // what was reached and how to fix it.
      let context: Record<string, unknown> | undefined;
      if (typeof r === 'object' && r !== null) {
        const extra = Object.entries(r as Record<string, unknown>)
          .filter(([k]) => !MAPPED_KEYS.has(k));
        if (extra.length) context = Object.fromEntries(extra);
      }

      return {
        status,
        body: {
          error: {
            code: typeof own === 'string' ? own : this.codeFor(status),
            message,
            details,
            ...(context ? { context } : {}),
          },
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
