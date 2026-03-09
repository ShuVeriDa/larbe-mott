import { Module } from "@nestjs/common";
import { NormalizerModule } from "src/markup-engine/normalizer/normalizer.module";
import { PrismaService } from "src/prisma.service";

import { AdminDictionaryModule } from "../dictionary/admin-dictionary.module";
import { TokenizerProcessor } from "./tokenizer.processor";
import { TokenizerService } from "./tokenizer.service";

@Module({
  imports: [NormalizerModule, AdminDictionaryModule],
  controllers: [],
  providers: [TokenizerService, TokenizerProcessor, PrismaService],
  exports: [TokenizerProcessor],
})
export class TokenizerModule {}
