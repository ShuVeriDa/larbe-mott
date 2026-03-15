import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { DictionaryProcessor } from "./dictionary.processor";
import { DictionaryService } from "./dictionary.service";

@Module({
  providers: [DictionaryService, DictionaryProcessor, PrismaService],
  exports: [DictionaryService, DictionaryProcessor],
})
export class DictionaryModule {}
