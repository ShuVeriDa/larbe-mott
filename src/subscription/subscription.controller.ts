import { Body, Controller, Delete, Get, HttpCode, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { SubscriptionService } from "./subscription.service";
import { FetchMyPaymentsDto } from "./dto/fetch-my-payments.dto";
import { RedeemPromoDto } from "./dto/redeem-promo.dto";
import { StartTrialDto } from "./dto/start-trial.dto";
import { SubscribePlanDto } from "./dto/subscribe-plan.dto";

@ApiTags("subscription")
@Controller()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get("plans")
  @ApiOperation({ summary: "Get available plans" })
  @ApiOkResponse({ description: "List of active plans ordered by price" })
  async getPlans() {
    return this.subscriptionService.getActivePlans();
  }

  @Get("subscription/me")
  @Auth()
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiOperation({ summary: "Get current user subscription" })
  @ApiOkResponse({
    description: "Active or trialing subscription with plan info, or null",
  })
  async getMySubscription(@User("id") userId: string) {
    return this.subscriptionService.getMySubscription(userId);
  }

  @Get("subscription/payments")
  @Auth()
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiOperation({ summary: "Get payment history for current user (cursor-paginated)" })
  @ApiOkResponse({
    description:
      "{ items[], nextCursor, hasMore }. Pass nextCursor as the `cursor` parameter to fetch the next page.",
  })
  async getMyPayments(
    @User("id") userId: string,
    @Query() dto: FetchMyPaymentsDto,
  ) {
    return this.subscriptionService.getMyPayments(userId, dto);
  }

  @Get("subscription/usage")
  @Auth()
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiOperation({ summary: "Get today usage and plan limits for current user" })
  @ApiOkResponse({
    description:
      "translationsToday, wordsInDictionary, limits (full PlanLimits JSON; -1 = unlimited).",
  })
  async getUsage(@User("id") userId: string) {
    return this.subscriptionService.getUsage(userId);
  }

  @Post("subscription/trial")
  @Auth()
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "Plan not found or inactive" })
  @ApiBadRequestResponse({
    description: "Trial not available for this plan, or plan is FREE",
  })
  @ApiConflictResponse({
    description: "Active subscription already exists, or trial already used",
  })
  @ApiOperation({ summary: "Start free trial on the given plan (one-time per user)" })
  @ApiOkResponse({
    description:
      "Created TRIALING subscription with status, startDate, endDate (= now + plan.trialDays), and plan info",
  })
  async startTrial(@User("id") userId: string, @Body() dto: StartTrialDto) {
    return this.subscriptionService.startTrial(userId, {
      planId: dto.planId,
      planCode: dto.planCode,
    });
  }

  @Post("subscription/subscribe")
  @Auth()
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "Plan not found or inactive" })
  @ApiOperation({ summary: "Subscribe to a plan (replaces current subscription)" })
  @ApiOkResponse({
    description:
      "New subscription with plan info. Includes couponApplied when a redeemed promo was used.",
  })
  async subscribe(@User("id") userId: string, @Body() dto: SubscribePlanDto) {
    return this.subscriptionService.subscribeToPlan(userId, {
      planId: dto.planId,
      planCode: dto.planCode,
    });
  }

  @Delete("subscription")
  @Auth()
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "No active subscription found" })
  @ApiOperation({ summary: "Cancel current subscription" })
  @ApiOkResponse({ description: "Canceled subscription with plan info" })
  async cancelSubscription(@User("id") userId: string) {
    return this.subscriptionService.cancelSubscription(userId);
  }

  @Post("subscription/promo")
  @Auth()
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "Promo code not found or inactive" })
  @ApiBadRequestResponse({ description: "Promo code expired or limit reached" })
  @ApiConflictResponse({ description: "Promo code already redeemed" })
  @ApiOperation({ summary: "Redeem a promo code" })
  @ApiOkResponse({
    description:
      "Coupon saved. The discount WILL BE APPLIED only on the next POST /subscription/subscribe — no immediate charge or change to the current subscription occurs. The status='saved_for_next_subscription' field lets the frontend display the correct toast ('Promo code saved').",
  })
  async redeemPromo(@User("id") userId: string, @Body() dto: RedeemPromoDto) {
    return this.subscriptionService.redeemCoupon(userId, dto.code);
  }
}
