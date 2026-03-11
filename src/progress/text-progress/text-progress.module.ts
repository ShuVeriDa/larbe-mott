import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { TextProgressService } from "./text-progress.service";

@Module({
  controllers: [],
  providers: [TextProgressService, PrismaService],
  exports: [TextProgressService],
})
export class TextProgressModule {}
