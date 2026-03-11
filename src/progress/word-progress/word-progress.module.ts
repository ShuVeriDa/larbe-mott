import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { WordProgressService } from "./word-progress.service";

@Module({
  controllers: [],
  providers: [WordProgressService, PrismaService],
  exports: [WordProgressService],
})
export class WordProgressModule {}
