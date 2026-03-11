import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { UnknownWordProcessor } from "./unknown-word.processor";

@Module({
  providers: [UnknownWordProcessor, PrismaService],
  exports: [UnknownWordProcessor],
})
export class UnknownWordModule {}
