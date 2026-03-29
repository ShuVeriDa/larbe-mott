import { Injectable } from "@nestjs/common";

interface RouteMetric {
  count: number;
  errorCount: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

@Injectable()
export class ObservabilityService {
  private totalRequests = 0;
  private totalErrors = 0;
  private readonly startedAt = new Date();
  private readonly routeMetrics = new Map<string, RouteMetric>();

  recordRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    this.totalRequests += 1;
    if (statusCode >= 400) this.totalErrors += 1;

    const key = `${method.toUpperCase()} ${path}`;
    const current = this.routeMetrics.get(key) ?? {
      count: 0,
      errorCount: 0,
      totalMs: 0,
      minMs: Number.POSITIVE_INFINITY,
      maxMs: 0,
    };

    current.count += 1;
    if (statusCode >= 400) current.errorCount += 1;
    current.totalMs += durationMs;
    current.minMs = Math.min(current.minMs, durationMs);
    current.maxMs = Math.max(current.maxMs, durationMs);

    this.routeMetrics.set(key, current);
  }

  snapshot() {
    const routes = [...this.routeMetrics.entries()].map(([route, metric]) => ({
      route,
      count: metric.count,
      errorCount: metric.errorCount,
      errorRatePercent: metric.count > 0 ? Math.round((metric.errorCount / metric.count) * 1000) / 10 : 0,
      avgMs: metric.count > 0 ? Math.round((metric.totalMs / metric.count) * 10) / 10 : 0,
      minMs: Number.isFinite(metric.minMs) ? metric.minMs : 0,
      maxMs: metric.maxMs,
    }));

    routes.sort((a, b) => b.count - a.count);

    return {
      startedAt: this.startedAt.toISOString(),
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      errorRatePercent:
        this.totalRequests > 0 ? Math.round((this.totalErrors / this.totalRequests) * 1000) / 10 : 0,
      routes,
    };
  }
}
