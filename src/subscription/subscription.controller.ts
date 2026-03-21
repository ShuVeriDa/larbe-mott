import { Controller, Get } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { SubscriptionService } from "./subscription.service";

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
}
