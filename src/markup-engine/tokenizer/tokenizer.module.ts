import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { TokenizerController } from "./tokenizer.controller";
import { TokenizerProcessor } from "./tokenizer.processor";
import { TokenizerService } from "./tokenizer.service";

@Module({
  controllers: [TokenizerController],
  providers: [TokenizerService, TokenizerProcessor, PrismaService],
  exports: [TokenizerProcessor],
})
export class TokenizerModule {}
