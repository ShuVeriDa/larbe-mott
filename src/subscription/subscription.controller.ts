import { Body, Controller, Delete, Get, HttpCode, Post } from "@nestjs/common";
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
import { RedeemPromoDto } from "./dto/redeem-promo.dto";
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
  @ApiOperation({ summary: "Get payment history for current user" })
  @ApiOkResponse({ description: "List of payments ordered by date descending" })
  async getMyPayments(@User("id") userId: string) {
    return this.subscriptionService.getMyPayments(userId);
  }

  @Get("subscription/usage")
  @Auth()
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiOperation({ summary: "Get today usage and plan limits for current user" })
  @ApiOkResponse({
    description: "translationsToday, wordsInDictionary, limits (maxTranslationsPerDay, maxVocabularyWords)",
  })
  async getUsage(@User("id") userId: string) {
    return this.subscriptionService.getUsage(userId);
  }

  @Post("subscription/subscribe")
  @Auth()
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @ApiNotFoundResponse({ description: "Plan not found or inactive" })
  @ApiOperation({ summary: "Subscribe to a plan (replaces current subscription)" })
  @ApiOkResponse({ description: "New subscription with plan info" })
  async subscribe(@User("id") userId: string, @Body() dto: SubscribePlanDto) {
    return this.subscriptionService.subscribeToPlan(userId, dto.planId);
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
  @ApiOkResponse({ description: "Coupon redeemed, returns discount type and amount" })
  async redeemPromo(@User("id") userId: string, @Body() dto: RedeemPromoDto) {
    return this.subscriptionService.redeemCoupon(userId, dto.code);
  }
}
