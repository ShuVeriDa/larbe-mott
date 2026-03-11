import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { MorphologyRuleEngine } from "./rule-engine.service";
import { MorphologyService } from "./morphology.service";

@Module({
  providers: [MorphologyService, MorphologyRuleEngine, PrismaService],
  exports: [MorphologyService],
})
export class MorphologyModule {}
