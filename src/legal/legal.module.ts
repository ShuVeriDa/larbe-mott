import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { LegalController } from "./legal.controller";
import { LegalService } from "./legal.service";

@Module({
  controllers: [LegalController],
  providers: [LegalService, PrismaService],
  exports: [LegalService],
})
export class LegalModule {}
