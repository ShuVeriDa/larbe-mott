import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminBillingService } from "./admin-billing.service";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { UpdatePlanDto } from "./dto/update-plan.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { ExtendSubscriptionDto } from "./dto/extend-subscription.dto";
import { RefundPaymentDto } from "./dto/refund-payment.dto";
import { CreateCouponDto } from "./dto/create-coupon.dto";
import { UpdateCouponDto } from "./dto/update-coupon.dto";

@ApiTags("admin/billing")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin")
export class AdminBillingController {
  constructor(private readonly billing: AdminBillingService) {}

  // -------- Plans --------
  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("plans")
  @ApiOperation({
    summary: "List plans",
    description: "Returns all plans (active and inactive).",
  })
  @ApiOkResponse({ description: "Array of plans." })
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
    description: "Updates plan fields (including archiving via isActive=false).",
  })
  @ApiOkResponse({ description: "Updated plan." })
  updatePlan(@Param("id") id: string, @Body() dto: UpdatePlanDto) {
    return this.billing.updatePlan(id, dto);
  }

  // -------- Subscriptions --------
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
      "Assign plan to user. Supports trial (trialDays) and lifetime (isLifetime).",
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
    description: "Cancels subscription (sets status=CANCELED).",
  })
  @ApiOkResponse({ description: "Updated subscription." })
  cancelSubscription(@Param("id") id: string) {
    return this.billing.cancelSubscription(id);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("subscriptions/:id/extend")
  @ApiOperation({
    summary: "Extend subscription",
    description: "Extends subscription endDate by a given number of days.",
  })
  @ApiOkResponse({ description: "Updated subscription." })
  extendSubscription(
    @Param("id") id: string,
    @Body() dto: ExtendSubscriptionDto,
  ) {
    return this.billing.extendSubscription(id, dto);
  }

  // -------- Payments --------
  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("payments")
  @ApiOperation({
    summary: "List payments",
    description: "Returns payments with user and subscription/plan info.",
  })
  @ApiOkResponse({ description: "Array of payments." })
  getPayments() {
    return this.billing.getPayments();
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("payments/:id/refund")
  @ApiOperation({
    summary: "Refund payment",
    description:
      "Marks payment as refunded (full or partial). This is a manual admin operation.",
  })
  @ApiOkResponse({ description: "Updated payment." })
  refundPayment(@Param("id") id: string, @Body() dto: RefundPaymentDto) {
    return this.billing.refundPayment(id, dto);
  }

  // -------- Coupons --------
  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Get("coupons")
  @ApiOperation({
    summary: "List coupons",
    description: "Returns all coupons.",
  })
  @ApiOkResponse({ description: "Array of coupons." })
  getCoupons() {
    return this.billing.getCoupons();
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("coupons")
  @ApiOperation({
    summary: "Create coupon",
    description: "Creates a new coupon.",
  })
  @ApiOkResponse({ description: "Created coupon." })
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.billing.createCoupon(dto);
  }

  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Patch("coupons/:id")
  @ApiOperation({
    summary: "Update coupon",
    description: "Updates coupon fields.",
  })
  @ApiOkResponse({ description: "Updated coupon." })
  updateCoupon(@Param("id") id: string, @Body() dto: UpdateCouponDto) {
    return this.billing.updateCoupon(id, dto);
  }

  // Optional helper endpoint to test redemption from Postman
  @AdminPermission(PermissionCode.CAN_MANAGE_BILLING)
  @Post("coupons/:code/redeem")
  @ApiOperation({
    summary: "Redeem coupon (admin test endpoint)",
    description:
      "Redeems coupon for a user and increments redeemedCount. Useful for testing.",
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

