import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import {
  TrackingAdminService,
  Granularity,
  Metric,
} from "./tracking-admin.service";
import { TrackingAggregatorService } from "./tracking-aggregator.service";
import type { ReferrerCategory } from "./referrer-categorization";

const ALLOWED_METRICS: Metric[] = [
  "pageviews",
  "uniqueVisitors",
  "sessions",
  "totalEvents",
  "bounceRate",
  "avgSessionSec",
];
const ALLOWED_GRANULARITY: Granularity[] = ["day", "week", "month"];
const ALLOWED_REFERRER_CATEGORIES: ReferrerCategory[] = ["search", "direct", "social", "other"];

@ApiTags("admin/tracking")
@Controller("admin/tracking")
@AdminPermission(PermissionCode.CAN_VIEW_ANALYTICS)
@ApiBearerAuth()
export class TrackingAdminController {
  constructor(
    private readonly service: TrackingAdminService,
    private readonly aggregator: TrackingAggregatorService,
  ) {}

  @Get("overview")
  @ApiOperation({ summary: "Dashboard overview: current range, comparison with previous, realtime" })
  @ApiQuery({ name: "from", required: false, example: "2026-04-01" })
  @ApiQuery({ name: "to", required: false, example: "2026-04-24" })
  overview(@Query("from") from?: string, @Query("to") to?: string) {
    return this.service.overview({ from: parseDate(from), to: parseDate(to) });
  }

  @Get("realtime")
  @ApiOperation({ summary: "Realtime stats: active visitors (5 min), queue size, events/min" })
  realtime() {
    return this.service.realtime();
  }

  @Get("timeseries")
  @ApiOperation({ summary: "Metric timeseries. Pass compare=true for previous-period comparison." })
  timeseries(
    @Query("metric", new DefaultValuePipe("pageviews")) metric: string,
    @Query("granularity", new DefaultValuePipe("day")) granularity: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("compare") compare?: string,
  ) {
    if (!ALLOWED_METRICS.includes(metric as Metric)) {
      throw new BadRequestException(`metric must be one of: ${ALLOWED_METRICS.join(", ")}`);
    }
    if (!ALLOWED_GRANULARITY.includes(granularity as Granularity)) {
      throw new BadRequestException(`granularity must be one of: ${ALLOWED_GRANULARITY.join(", ")}`);
    }
    const opts = { from: parseDate(from), to: parseDate(to) };
    if (compare === "true" || compare === "1") {
      return this.service.timeseriesWithCompare(metric as Metric, granularity as Granularity, opts);
    }
    return this.service.timeseries(metric as Metric, granularity as Granularity, opts);
  }

  @Get("timeseries/summary")
  @ApiOperation({ summary: "Timeseries aggregates: total, avg, peak, min." })
  timeseriesSummary(
    @Query("metric", new DefaultValuePipe("pageviews")) metric: string,
    @Query("granularity", new DefaultValuePipe("day")) granularity: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    if (!ALLOWED_METRICS.includes(metric as Metric)) {
      throw new BadRequestException(`metric must be one of: ${ALLOWED_METRICS.join(", ")}`);
    }
    if (!ALLOWED_GRANULARITY.includes(granularity as Granularity)) {
      throw new BadRequestException(`granularity must be one of: ${ALLOWED_GRANULARITY.join(", ")}`);
    }
    return this.service.timeseriesSummary(metric as Metric, granularity as Granularity, { from: parseDate(from), to: parseDate(to) });
  }

  @Get("timeseries/multi")
  @ApiOperation({ summary: "Multi-metric timeseries in one request (for Overview sparklines)" })
  @ApiQuery({ name: "metrics", required: true, example: "pageviews,uniqueVisitors,sessions,totalEvents,bounceRate,avgSessionSec" })
  timeseriesMulti(
    @Query("metrics") metricsRaw: string | undefined,
    @Query("granularity", new DefaultValuePipe("day")) granularity: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const metrics = (metricsRaw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (metrics.length === 0) throw new BadRequestException("metrics is required");
    for (const m of metrics) {
      if (!ALLOWED_METRICS.includes(m as Metric)) {
        throw new BadRequestException(`metric must be one of: ${ALLOWED_METRICS.join(", ")} (got "${m}")`);
      }
    }
    if (!ALLOWED_GRANULARITY.includes(granularity as Granularity)) {
      throw new BadRequestException(`granularity must be one of: ${ALLOWED_GRANULARITY.join(", ")}`);
    }
    return this.service.timeseriesMulti(metrics as Metric[], granularity as Granularity, { from: parseDate(from), to: parseDate(to) });
  }

  @Get("top-pages")
  @ApiOperation({ summary: "Top pages from daily aggregate (top-20/day preview)" })
  topPages(
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.topPaths({ from: parseDate(from), to: parseDate(to) }, Math.min(limit, 200));
  }

  @Get("pages")
  @ApiOperation({ summary: "Paginated URL list with exact counts from raw events" })
  pages(
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query("search") search?: string,
    @Query("country") country?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.listPages({ from: parseDate(from), to: parseDate(to) }, { limit, offset, search, country });
  }

  @Get("top-referrers")
  @ApiOperation({ summary: "Top referrer domains with category. Pass category to filter." })
  @ApiQuery({ name: "category", required: false, enum: ALLOWED_REFERRER_CATEGORIES })
  @ApiQuery({ name: "offset", required: false, example: 0 })
  topReferrers(
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("category") category?: string,
  ) {
    let cat: ReferrerCategory | undefined;
    if (category) {
      if (!ALLOWED_REFERRER_CATEGORIES.includes(category as ReferrerCategory)) {
        throw new BadRequestException(`category must be one of: ${ALLOWED_REFERRER_CATEGORIES.join(", ")}`);
      }
      cat = category as ReferrerCategory;
    }
    return this.service.topReferrers({ from: parseDate(from), to: parseDate(to) }, Math.min(Math.max(limit, 0), 200), Math.max(offset, 0), cat);
  }

  @Get("referrers/breakdown")
  @ApiOperation({ summary: "Referrer category breakdown: total, uniqueHosts, byCategory" })
  referrerBreakdown(@Query("from") from?: string, @Query("to") to?: string) {
    return this.service.referrerBreakdown({ from: parseDate(from), to: parseDate(to) });
  }

  @Get("top-countries")
  @ApiOperation({ summary: "Top countries (filled only when GeoIP is configured)" })
  topCountries(
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.topCountries({ from: parseDate(from), to: parseDate(to) }, Math.min(limit, 250));
  }

  @Get("top-cities")
  @ApiOperation({ summary: "Top cities (requires City GeoIP database)" })
  @ApiQuery({ name: "country", required: false, description: "ISO country code to filter cities" })
  topCities(
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("country") country?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.topCities({ from: parseDate(from), to: parseDate(to) }, { limit: Math.min(Math.max(limit, 1), 500), country });
  }

  @Get("geography/stats")
  @ApiOperation({ summary: "Geography stats: event counts, unique countries/cities, top country/city" })
  geographyStats(@Query("from") from?: string, @Query("to") to?: string) {
    return this.service.geographyStats({ from: parseDate(from), to: parseDate(to) });
  }

  @Get("geography/status")
  @ApiOperation({ summary: "GeoIP setup status + coverage for last 7 days" })
  geographyStatus() {
    return this.service.geoipStatus();
  }

  @Get("devices")
  @ApiOperation({ summary: "Device breakdown (desktop/mobile/tablet/bot)" })
  devices(@Query("from") from?: string, @Query("to") to?: string) {
    return this.service.uaBreakdown("device", { from: parseDate(from), to: parseDate(to) });
  }

  @Get("browsers")
  @ApiOperation({ summary: "Browser breakdown" })
  browsers(@Query("from") from?: string, @Query("to") to?: string) {
    return this.service.uaBreakdown("browser", { from: parseDate(from), to: parseDate(to) });
  }

  @Get("os")
  @ApiOperation({ summary: "OS breakdown" })
  os(@Query("from") from?: string, @Query("to") to?: string) {
    return this.service.uaBreakdown("os", { from: parseDate(from), to: parseDate(to) });
  }

  @Get("word-clicks")
  @ApiOperation({ summary: "Top clicked words — the key metric for the reader app" })
  @ApiQuery({ name: "limit", required: false, example: 50 })
  topWordClicks(
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.topWordClicks({ from: parseDate(from), to: parseDate(to) }, Math.min(limit, 500));
  }

  @Get("recent")
  @ApiOperation({ summary: "Recent events (live feed). Supports sinceId for incremental polling." })
  @ApiQuery({ name: "limit", required: false, example: 100 })
  @ApiQuery({ name: "sinceId", required: false, description: "Return only events with id > sinceId" })
  @ApiQuery({ name: "eventType", required: false, example: "word_click,text_open" })
  recent(
    @Query("limit", new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query("sinceId") sinceId?: string,
    @Query("eventType") eventType?: string,
  ) {
    const eventTypes = eventType ? eventType.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    return this.service.recentEvents({ limit, sinceId, eventTypes });
  }

  @Post("aggregate")
  @HttpCode(202)
  @ApiOperation({ summary: "Force re-aggregate daily stats (for day=YYYY-MM-DD or last 3 days)" })
  async aggregate(@Query("day") day?: string) {
    if (day) {
      const d = parseDate(day);
      if (!d) throw new BadRequestException("Invalid day format");
      await this.aggregator.aggregateDay(d);
      return { aggregated: day };
    }
    await this.aggregator.aggregateRecent();
    return { aggregated: "last-3-days" };
  }
}

const parseDate = (value: string | undefined): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date: ${value}`);
  return d;
};
