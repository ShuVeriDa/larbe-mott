import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { HeritageController } from "./heritage.controller";
import { HeritageService } from "./heritage.service";

@Module({
  controllers: [HeritageController],
  providers: [HeritageService, PrismaService],
  exports: [HeritageService],
})
export class HeritageModule {}
