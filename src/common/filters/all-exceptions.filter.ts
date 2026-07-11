import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import type { LoggerService } from "@nestjs/common";
import type { Request, Response } from "express";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import type { CorrelationRequest } from "../middleware/correlation-id.middleware";
import { ObservabilityService } from "../observability/observability.service";
import { ErrorCode } from "../errors/error-codes";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly observability: ObservabilityService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<CorrelationRequest>();
    const res = ctx.getResponse<Response>();
    const correlationId = req.correlationId ?? "unknown";
    const start = req.requestStartMs ?? Date.now();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : "Internal server error";

    const responseBody =
      exception instanceof HttpException
        ? exception.getResponse()
        : null;

    const isPlainResponseBody = responseBody !== null && typeof responseBody === "object";
    const responseBodyRecord = isPlainResponseBody ? (responseBody as Record<string, unknown>) : {};

    const code: string =
      typeof responseBodyRecord.code === "string"
        ? responseBodyRecord.code
        : status >= 500
          ? ErrorCode.INTERNAL_SERVER_ERROR
          : message;

    // Some exceptions attach extra structured fields beyond code/message
    // (e.g. AuthService's ACCOUNT_SCHEDULED_FOR_DELETION includes deletedAt +
    // restoreEligible so the frontend can offer an inline "restore account?"
    // prompt instead of a dead-end error). Forward anything beyond the
    // reserved keys below so those fields reach the client.
    const RESERVED_KEYS = new Set(["code", "message", "statusCode", "error"]);
    const extraFields = Object.fromEntries(
      Object.entries(responseBodyRecord).filter(([key]) => !RESERVED_KEYS.has(key)),
    );

    if (status >= 500) {
      this.logger.error(
        `[${correlationId}] ${req.method} ${req.url} ${status} — ${message}`,
        exception instanceof Error ? exception.stack : undefined,
        "HTTP",
      );
    } else {
      this.logger.warn(
        `[${correlationId}] ${req.method} ${req.url} ${status} — ${message}`,
        "HTTP",
      );
    }
    this.observability.recordRequest(req.method, req.url, status, Date.now() - start);

    res.status(status).json({
      statusCode: status,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: req.url,
      correlationId,
      ...extraFields,
    });
  }
}
