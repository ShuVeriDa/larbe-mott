import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { PrismaService } from "src/prisma.service";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";

@Module({
  imports: [AuthModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, PrismaService],
})
export class FeedbackModule {}
