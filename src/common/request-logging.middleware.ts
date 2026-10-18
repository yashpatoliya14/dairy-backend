import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction) {
    const startedAt = Date.now();
    const requestBody = this.sanitizeBody(request.body);
    const query = Object.keys(request.query).length
      ? ` query=${JSON.stringify(request.query)}`
      : '';
    const body = Object.keys(requestBody).length
      ? ` body=${JSON.stringify(requestBody)}`
      : '';

    this.logger.log(
      `Incoming ${request.method} ${request.originalUrl}${query}${body}`,
    );

    response.on('finish', () => {
      this.logger.log(
        `${request.method} ${request.originalUrl} ${response.statusCode} ` +
          `${Date.now() - startedAt}ms`,
      );
    });

    next();
  }

  private sanitizeBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return {};

    const sanitized = { ...(body as Record<string, unknown>) };
    for (const field of ['password', 'currentPassword', 'newPassword']) {
      if (field in sanitized) sanitized[field] = '[REDACTED]';
    }
    return sanitized;
  }
}
