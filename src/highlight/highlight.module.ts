import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { HighlightController } from "./highlight.controller";
import { HighlightService } from "./highlight.service";

@Module({
  controllers: [HighlightController],
  providers: [HighlightService, PrismaService],
})
export class HighlightModule {}
