import { Module } from "@nestjs/common";
import { NormalizerModule } from "src/markup-engine/normalizer/normalizer.module";
import { PrismaService } from "src/prisma.service";

import { DictionaryCacheModule } from "../dictionary-cache/dictionary-cache.module";
import { DictionaryModule } from "../dictionary/dictionary.module";
import { OnlineDictionaryModule } from "../online-dictionary/online-dictionary.module";
import { UnknownWordModule } from "../unknown-word/unknown-word.module";
import { TokenizerProcessor } from "./tokenizer.processor";
import { TokenizerService } from "./tokenizer.service";

@Module({
  imports: [
    NormalizerModule,
    DictionaryModule,
    DictionaryCacheModule,
    OnlineDictionaryModule,
    UnknownWordModule,
  ],
  controllers: [],
  providers: [TokenizerService, TokenizerProcessor, PrismaService],
  exports: [TokenizerProcessor, TokenizerService],
})
export class TokenizerModule {}
