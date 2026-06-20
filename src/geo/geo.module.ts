import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { GeoController } from "./geo.controller";
import { GeoService } from "./geo.service";

@Module({
  controllers: [GeoController],
  providers: [GeoService, PrismaService],
  exports: [GeoService],
})
export class GeoModule {}
