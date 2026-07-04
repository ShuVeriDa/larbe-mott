import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { FeatureFlagsController } from "./feature-flags.controller";
import { FeatureFlagsService } from "./feature-flags.service";

@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, PrismaService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
