import { Global, Module } from "@nestjs/common";
import { PremiumGuard } from "src/auth/guards/premium.guard";
import { PrismaService } from "src/prisma.service";
import { SubscriptionController } from "./subscription.controller";
import { SubscriptionService } from "./subscription.service";

@Global()
@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService, PrismaService, PremiumGuard],
  exports: [SubscriptionService, PremiumGuard, PrismaService],
})
export class SubscriptionModule {}
