import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { NormalizerService } from "./normalizer.service";

@Module({
  providers: [NormalizerService, PrismaService],
  exports: [NormalizerService],
})
export class NormalizerModule {}
