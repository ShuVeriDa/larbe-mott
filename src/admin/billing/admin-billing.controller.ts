import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import type { Response } from "express";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminBillingService } from "./admin-billing.service";
import { CancelSubscriptionDto } from "./dto/cancel-subscription.dto";
import { CreateCouponDto } from "./dto/create-coupon.dto";
import { CreateManualSubscriptionDto } from "./dto/create-manual-subscription.dto";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { ExtendSubscriptionDto } from "./dto/extend-subscription.dto";
import { FetchCouponsDto } from "./dto/fetch-coupons.dto";
import { FetchPaymentsDto } from "./dto/fetch-payments.dto";
import { FetchPlansDto } from "./dto/fetch-plans.dto";
import { FetchSubscriptionsDto } from "./dto/fetch-subscriptions.dto";
import { RefundPaymentDto } from "./dto/refund-payment.dto";
import { SendReceiptDto } from "./dto/send-receipt.dto";
import { UpdateCouponDto } from "./dto/update-coupon.dto";
import { UpdatePlanDto } from "./dto/update-plan.dto";
import { UpdatePlanLimitsDto } from "./dto/update-plan-limits.dto";

@ApiTags("admin/billing")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin")
export class AdminBillingController {
  constructor(private readonly billing: AdminBillingService) {}

  // ──────────────────────────────────────────────────────────────────────────────
  // Global KPI / Stats
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("billing/stats")
  @ApiOperation({
    summary: "Billing KPI stats",
    description:
      "Returns payingCount, totalUsers, MRR, ARR, conversionRate, churnRate за последние 30 дней, " +
      "а также дельты к предыдущему 30-дневному периоду: payingDeltaLast30 (шт), mrrGrowthPct (%), " +
      "conversionDeltaPp (пп), churnDeltaPp (пп). mrrGrowthPct = null, если MRR 30 дней назад был 0.",
  })
  @ApiOkResponse({
    description:
      "{ payingCount, totalUsers, mrrCents, arrCents, conversionRate, churnRate, payingDeltaLast30, mrrGrowthPct, conversionDeltaPp, churnDeltaPp }",
  })
  getBillingStats() {
    return this.billing.getBillingStats();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Revenue by plan
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("billing/revenue")
  @ApiOperation({
    summary: "Revenue breakdown by plan",
    description:
      "Aggregates succeeded payments grouped by plan. Used for the revenue bar chart.",
  })
  @ApiOkResponse({
    description: "Array of { planId, planCode, planName, totalCents }",
  })
  getPlanRevenue() {
    return this.billing.getPlanRevenue();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Plans
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("plans")
  @ApiOperation({
    summary: "List plans",
    description:
      "Returns plans with subscriberCount. Filters: onlyActive (true → только isActive), type, groupCode.",
  })
  @ApiOkResponse({ description: "Array of plans with subscriberCount." })
  getPlans(@Query() dto: FetchPlansDto) {
    return this.billing.getPlans(dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("plans")
  @ApiOperation({
    summary: "Create plan",
    description: "Creates a new billing plan.",
  })
  @ApiOkResponse({ description: "Created plan." })
  createPlan(@Body() dto: CreatePlanDto) {
    return this.billing.createPlan(dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Patch("plans/:id")
  @ApiOperation({
    summary: "Update plan",
    description:
      "Updates plan fields (name, prices, description, isActive, limits, groupCode, displayColor, iconKey, highlightFeatures). Pass limits to replace the full JSON limits object — для частичного апдейта используйте PATCH /admin/plans/:id/limits.",
  })
  @ApiOkResponse({ description: "Updated plan." })
  updatePlan(@Param("id") id: string, @Body() dto: UpdatePlanDto) {
    return this.billing.updatePlan(id, dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Patch("plans/:id/limits")
  @ApiOperation({
    summary: "Update plan limits (partial merge)",
    description:
      "Частично обновляет JSON-объект лимитов плана: переданная дельта мерджится с текущим plan.limits, " +
      "поэтому фронт может слать только изменённые поля. Передайте replace=true чтобы заменить лимиты целиком.",
  })
  @ApiOkResponse({ description: "Updated plan." })
  updatePlanLimits(
    @Param("id") id: string,
    @Body() dto: UpdatePlanLimitsDto,
  ) {
    return this.billing.updatePlanLimits(id, dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("plans/:id/deactivate")
  @ApiOperation({
    summary: "Deactivate plan",
    description:
      "Sets isActive=false. Безопасная альтернатива удалению — у плана могут быть активные подписки.",
  })
  @ApiOkResponse({ description: "Updated plan with isActive=false." })
  deactivatePlan(@Param("id") id: string) {
    return this.billing.deactivatePlan(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Delete("plans/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete plan",
    description:
      "Permanently deletes a plan. Returns 409 если у плана есть подписки (любой статус) — в этом случае используйте deactivate.",
  })
  @ApiNoContentResponse({ description: "Plan deleted." })
  deletePlan(@Param("id") id: string) {
    return this.billing.deletePlan(id);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Subscriptions — KPI stats
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("subscriptions/stats")
  @ApiOperation({
    summary: "Subscription KPI stats",
    description:
      "Returns counts by status (active, trialing, canceled, expired), deltas for the last 30 days, new active in 30d, and trials expiring within 7d.",
  })
  @ApiOkResponse({
    description:
      "{ activeCount, trialingCount, canceledCount, expiredCount, canceledLast30, expiredLast30, activeLast30, trialingExpiringIn7d, total }",
  })
  getSubscriptionStats() {
    return this.billing.getSubscriptionStats();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Subscriptions — paginated list
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("subscriptions")
  @ApiOperation({
    summary: "List all subscriptions",
    description:
      "Paginated list of all subscriptions with user and plan info. Filterable by status, provider, planId/planType/planCode, userId, search (name/email/id) and sortable by next billing date / amount / createdAt.",
  })
  @ApiOkResponse({ description: "{ items[], total, page, limit }" })
  getSubscriptions(@Query() dto: FetchSubscriptionsDto) {
    return this.billing.getSubscriptions(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Subscriptions — export (CSV / JSON)
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("subscriptions/export")
  @ApiOperation({
    summary: "Export subscriptions",
    description:
      "Export subscriptions matching current filters. Add ?format=csv for a CSV file download.",
  })
  @ApiOkResponse({ description: "JSON array or CSV file" })
  async exportSubscriptions(
    @Query() dto: FetchSubscriptionsDto,
    @Res() res: Response,
  ) {
    const result = await this.billing.exportSubscriptions(dto);
    if (result.format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="subscriptions.csv"',
      );
      res.send(result.data);
    } else {
      res.json(result.data);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Subscriptions — manual create (resolves user by id or email)
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("subscriptions")
  @ApiOperation({
    summary: "Create manual subscription",
    description:
      "Create a subscription for a user identified by userId or email. Supports planId or planCode, trialDays, durationDays, isLifetime, reason.",
  })
  @ApiOkResponse({ description: "Created subscription." })
  createManualSubscription(@Body() dto: CreateManualSubscriptionDto) {
    return this.billing.createManualSubscription(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Subscriptions — single detail
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("subscriptions/:id")
  @ApiOperation({
    summary: "Get subscription detail",
    description:
      "Full subscription card: user roles, last payments, billing event log.",
  })
  @ApiOkResponse({ description: "Subscription with user, payments, events." })
  getSubscriptionDetail(@Param("id") id: string) {
    return this.billing.getSubscriptionDetail(id);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Subscriptions — per user
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("users/:id/subscriptions")
  @ApiOperation({
    summary: "List user subscriptions",
    description: "Returns subscriptions for the specified user.",
  })
  @ApiOkResponse({ description: "Array of subscriptions with plan." })
  getUserSubscriptions(@Param("id") userId: string) {
    return this.billing.getUserSubscriptions(userId);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("users/:id/subscriptions")
  @ApiOperation({
    summary: "Create user subscription",
    description:
      "Assign plan to user. Supports trial (trialDays) and lifetime (isLifetime). Creates SubscriptionEvent automatically.",
  })
  @ApiOkResponse({ description: "Created subscription." })
  createUserSubscription(
    @Param("id") userId: string,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.billing.createUserSubscription(userId, dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("subscriptions/:id/cancel")
  @ApiOperation({
    summary: "Cancel subscription",
    description:
      "Cancels subscription (sets status=CANCELED). Creates SubscriptionEvent. Optional reason is stored in event metadata.",
  })
  @ApiOkResponse({ description: "Updated subscription." })
  cancelSubscription(
    @Param("id") id: string,
    @Body() dto?: CancelSubscriptionDto,
  ) {
    return this.billing.cancelSubscription(id, dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("subscriptions/:id/extend")
  @ApiOperation({
    summary: "Extend subscription",
    description:
      "Extends subscription endDate by a given number of days. Creates SubscriptionEvent.",
  })
  @ApiOkResponse({ description: "Updated subscription." })
  extendSubscription(
    @Param("id") id: string,
    @Body() dto: ExtendSubscriptionDto,
  ) {
    return this.billing.extendSubscription(id, dto);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Payments — KPI stats
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("payments/stats")
  @ApiOperation({
    summary: "Payment KPI stats",
    description:
      "Current month: revenue, transaction count, refunds, avg ticket, failed count with month-over-month deltas.",
  })
  @ApiOkResponse({
    description:
      "{ revenueCents, revenueGrowth, transactionCount, refundCount, refundCents, failedCount, avgTicketCents }",
  })
  getPaymentStats() {
    return this.billing.getPaymentStats();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Payments — chart (revenue by day)
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("payments/chart")
  @ApiOperation({
    summary: "Revenue by day (chart data)",
    description:
      "Returns array of { day, revenueCents, refundCents } for the given date range. Defaults to current month.",
  })
  @ApiOkResponse({ description: "Array of { day: string, revenueCents: number, refundCents: number }." })
  getPaymentChart(
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.billing.getPaymentChart(dateFrom, dateTo);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Payments — breakdown by provider
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("payments/by-provider")
  @ApiOperation({
    summary: "Revenue breakdown by payment provider",
    description:
      "Aggregates all succeeded payments by provider. Returns totalCents, count and pct for each provider.",
  })
  @ApiOkResponse({
    description: "Array of { provider, totalCents, count, pct }.",
  })
  getPaymentsByProvider() {
    return this.billing.getPaymentsByProvider();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Payments — paginated list
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("payments")
  @ApiOperation({
    summary: "List payments",
    description:
      "Paginated list of payments with user and subscription/plan info. Filterable by status, provider, planId, dateFrom, dateTo, search, amountMin, amountMax.",
  })
  @ApiOkResponse({ description: "{ items[], total, page, limit }" })
  getPayments(@Query() dto: FetchPaymentsDto) {
    return this.billing.getPayments(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Payments — CSV export
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("payments/export.csv")
  @ApiOperation({
    summary: "Export payments as CSV",
    description:
      "Streams the payment list filtered by the same query params as GET /admin/payments. Returns CSV with up to 10 000 rows.",
  })
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="payments.csv"')
  async exportPaymentsCsv(@Query() dto: FetchPaymentsDto, @Res() res: Response) {
    const csv = await this.billing.exportPaymentsCsv(dto);
    res.send(csv);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Payments — single detail
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("payments/:id")
  @ApiOperation({
    summary: "Get payment detail",
    description:
      "Full payment card: user profile, user's other payments, subscription info.",
  })
  @ApiOkResponse({ description: "Payment with user and subscription detail." })
  getPaymentDetail(@Param("id") id: string) {
    return this.billing.getPaymentDetail(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("payments/:id/refund")
  @ApiOperation({
    summary: "Refund payment",
    description:
      "Marks payment as refunded (full or partial). Accepts optional reason / reasonNote, persisted in SubscriptionEvent metadata.",
  })
  @ApiOkResponse({ description: "Updated payment." })
  refundPayment(@Param("id") id: string, @Body() dto: RefundPaymentDto) {
    return this.billing.refundPayment(id, dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("payments/:id/send-receipt")
  @ApiOperation({
    summary: "Email receipt to user",
    description:
      "Sends a payment receipt email to the user (or to body.email if provided).",
  })
  @ApiOkResponse({ description: "{ sent: true, to: string }" })
  sendPaymentReceipt(
    @Param("id") id: string,
    @Body() dto: SendReceiptDto,
  ) {
    return this.billing.sendPaymentReceipt(id, dto.email);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Coupons — KPI stats
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("coupons/stats")
  @ApiOperation({
    summary: "Coupon KPI stats",
    description:
      "Returns activeCount, totalCreated, totalRedemptions, usagesThisMonth, usageGrowth.",
  })
  @ApiOkResponse({
    description:
      "{ activeCount, totalCreated, totalRedemptions, usagesThisMonth, usageGrowth }",
  })
  getCouponStats() {
    return this.billing.getCouponStats();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Coupons — paginated list
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("coupons")
  @ApiOperation({
    summary: "List coupons",
    description:
      "Paginated list of coupons with computed status. Filterable by type, status, plan, search.",
  })
  @ApiOkResponse({ description: "{ items[], total, page, limit }. Each item has computedStatus: active | expired | exhausted | disabled." })
  getCoupons(@Query() dto: FetchCouponsDto) {
    return this.billing.getCoupons(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Coupons — CSV export (must come before :id to avoid shadowing)
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("coupons/export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="coupons.csv"')
  @ApiOperation({
    summary: "Export coupons as CSV",
    description:
      "Returns all coupons matching the same filters as the list endpoint, in CSV format.",
  })
  @ApiOkResponse({ description: "CSV payload of coupons (all pages)." })
  exportCoupons(@Query() dto: FetchCouponsDto) {
    return this.billing.exportCouponsCsv(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Coupons — single detail
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("coupons/:id")
  @ApiOperation({
    summary: "Get coupon detail",
    description:
      "Full coupon card with last 10 redemptions (user name, plan, discount, date) and computedStatus.",
  })
  @ApiOkResponse({ description: "Coupon with redemptions and computedStatus." })
  getCouponDetail(@Param("id") id: string) {
    return this.billing.getCouponDetail(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("coupons")
  @ApiOperation({
    summary: "Create coupon",
    description:
      "Creates a new discount coupon. New fields: maxPerUser, newUsersOnly, isStackable.",
  })
  @ApiOkResponse({ description: "Created coupon." })
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.billing.createCoupon(dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Patch("coupons/:id")
  @ApiOperation({
    summary: "Update coupon",
    description: "Updates coupon fields. Use isActive=false to deactivate.",
  })
  @ApiOkResponse({ description: "Updated coupon." })
  updateCoupon(@Param("id") id: string, @Body() dto: UpdateCouponDto) {
    return this.billing.updateCoupon(id, dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("coupons/:id/deactivate")
  @ApiOperation({
    summary: "Deactivate coupon",
    description: "Sets isActive=false. Safe alternative to delete for redeemed coupons.",
  })
  @ApiOkResponse({ description: "Updated coupon with isActive=false." })
  deactivateCoupon(@Param("id") id: string) {
    return this.billing.deactivateCoupon(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("coupons/:id/activate")
  @ApiOperation({
    summary: "Activate coupon",
    description: "Sets isActive=true. Restores a previously deactivated coupon.",
  })
  @ApiOkResponse({ description: "Updated coupon with isActive=true." })
  activateCoupon(@Param("id") id: string) {
    return this.billing.activateCoupon(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Delete("coupons/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete coupon",
    description:
      "Permanently deletes a coupon. Fails if the coupon has already been redeemed — use deactivate instead.",
  })
  @ApiNoContentResponse({ description: "Coupon deleted." })
  deleteCoupon(@Param("id") id: string) {
    return this.billing.deleteCoupon(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("coupons/:code/redeem")
  @ApiOperation({
    summary: "Redeem coupon (admin test endpoint)",
    description:
      "Redeems coupon for a user and increments redeemedCount. Validates maxPerUser, expiry, and exhaustion.",
  })
  @ApiOkResponse({ description: "Coupon and redemption record." })
  redeemCoupon(
    @Param("code") code: string,
    @Query("userId") userId: string,
    @Query("paymentId") paymentId?: string,
    @User("id") _adminUserId?: string,
  ) {
    return this.billing.redeemCoupon(userId, code, paymentId);
  }
}
