import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminBillingService } from "./admin-billing.service";
import { CreateCouponDto } from "./dto/create-coupon.dto";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { ExtendSubscriptionDto } from "./dto/extend-subscription.dto";
import { FetchCouponsDto } from "./dto/fetch-coupons.dto";
import { FetchPaymentsDto } from "./dto/fetch-payments.dto";
import { FetchSubscriptionsDto } from "./dto/fetch-subscriptions.dto";
import { RefundPaymentDto } from "./dto/refund-payment.dto";
import { UpdateCouponDto } from "./dto/update-coupon.dto";
import { UpdatePlanDto } from "./dto/update-plan.dto";

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
      "Returns payingCount, totalUsers, MRR, ARR, conversionRate (last 30 days), churnRate (last 30 days).",
  })
  @ApiOkResponse({
    description: "{ payingCount, totalUsers, mrrCents, arrCents, conversionRate, churnRate }",
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
    description: "Returns all plans (active and inactive) with subscriberCount.",
  })
  @ApiOkResponse({ description: "Array of plans with subscriberCount." })
  getPlans() {
    return this.billing.getPlans();
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
      "Updates plan fields (name, prices, description, isActive, limits). Pass limits to update the full JSON limits object.",
  })
  @ApiOkResponse({ description: "Updated plan." })
  updatePlan(@Param("id") id: string, @Body() dto: UpdatePlanDto) {
    return this.billing.updatePlan(id, dto);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Subscriptions — KPI stats
  // ──────────────────────────────────────────────────────────────────────────────

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("subscriptions/stats")
  @ApiOperation({
    summary: "Subscription KPI stats",
    description:
      "Returns counts by status (active, trialing, canceled, expired) and deltas for the last 30 days.",
  })
  @ApiOkResponse({
    description:
      "{ activeCount, trialingCount, canceledCount, expiredCount, canceledLast30, expiredLast30, total }",
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
      "Paginated list of all subscriptions with user and plan info. Filterable by status, provider, planId, userId, search (name/email).",
  })
  @ApiOkResponse({ description: "{ items[], total, page, limit }" })
  getSubscriptions(@Query() dto: FetchSubscriptionsDto) {
    return this.billing.getSubscriptions(dto);
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
    description: "Cancels subscription (sets status=CANCELED). Creates SubscriptionEvent.",
  })
  @ApiOkResponse({ description: "Updated subscription." })
  cancelSubscription(@Param("id") id: string) {
    return this.billing.cancelSubscription(id);
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
      "Paginated list of payments with user and subscription/plan info. Filterable by status, provider, planId, dateFrom, dateTo, search.",
  })
  @ApiOkResponse({ description: "{ items[], total, page, limit }" })
  getPayments(@Query() dto: FetchPaymentsDto) {
    return this.billing.getPayments(dto);
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
      "Marks payment as refunded (full or partial). Creates SubscriptionEvent if payment has a subscription.",
  })
  @ApiOkResponse({ description: "Updated payment." })
  refundPayment(@Param("id") id: string, @Body() dto: RefundPaymentDto) {
    return this.billing.refundPayment(id, dto);
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
