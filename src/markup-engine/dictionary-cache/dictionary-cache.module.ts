import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { DictionaryCacheProcessor } from "./dictionary-cache.processor";
import { DictionaryCacheService } from "./dictionary-cache.service";

@Module({
  providers: [DictionaryCacheService, DictionaryCacheProcessor, PrismaService],
  exports: [DictionaryCacheProcessor],
})
export class DictionaryCacheModule {}
