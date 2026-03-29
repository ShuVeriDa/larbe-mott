import { Module } from "@nestjs/common";
import { AnalyticsModule } from "src/analytics/analytics.module";
import { PrismaService } from "src/prisma.service";
import { ProgressController } from "./progress.controller";
import { ProgressService } from "./progress.service";
import { TextProgressModule } from "./text-progress/text-progress.module";
import { WordProgressModule } from "./word-progress/word-progress.module";

@Module({
  imports: [WordProgressModule, TextProgressModule, AnalyticsModule],
  controllers: [ProgressController],
  providers: [ProgressService, PrismaService],
  exports: [ProgressService, WordProgressModule, TextProgressModule],
})
export class ProgressModule {}

