import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { NormalizerModule } from "src/markup-engine/normalizer/normalizer.module";

import { TokenizerProcessor } from "./tokenizer.processor";
import { TokenizerService } from "./tokenizer.service";

@Module({
  imports: [NormalizerModule],
  controllers: [],
  providers: [TokenizerService, TokenizerProcessor, PrismaService],
  exports: [TokenizerProcessor],
})
export class TokenizerModule {}
