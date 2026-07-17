import { Module } from "@nestjs/common";
import { FeatureFlagsModule } from "src/feature-flags/feature-flags.module";
import { PrismaService } from "src/prisma.service";
import { AiTranslationController } from "./ai-translation.controller";
import { AiTranslationService } from "./ai-translation.service";

@Module({
  imports: [FeatureFlagsModule],
  controllers: [AiTranslationController],
  providers: [AiTranslationService, PrismaService],
  exports: [AiTranslationService],
})
export class AiTranslationModule {}
