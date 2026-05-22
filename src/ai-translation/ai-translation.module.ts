import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { AiTranslationController } from "./ai-translation.controller";
import { AiTranslationService } from "./ai-translation.service";

@Module({
  controllers: [AiTranslationController],
  providers: [AiTranslationService, PrismaService],
  exports: [AiTranslationService],
})
export class AiTranslationModule {}
