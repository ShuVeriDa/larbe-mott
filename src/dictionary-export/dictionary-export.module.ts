import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { DictionaryExportService } from "./dictionary-export.service";

@Module({
  providers: [DictionaryExportService, PrismaService],
  exports: [DictionaryExportService],
})
export class DictionaryExportModule {}
