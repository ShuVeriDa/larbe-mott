import { Module } from "@nestjs/common";
import { DictionaryCacheModule } from "src/markup-engine/dictionary-cache/dictionary-cache.module";
import { DictionaryModule } from "src/markup-engine/dictionary/dictionary.module";
import { MorphologyModule } from "src/markup-engine/morphology/morphology.module";
import { OnlineDictionaryModule } from "src/markup-engine/online-dictionary/online-dictionary.module";
import { TokenizerModule } from "src/markup-engine/tokenizer/tokenizer.module";
import { UnknownWordModule } from "src/markup-engine/unknown-word/unknown-word.module";
import { PrismaService } from "src/prisma.service";
import { TokenModule } from "src/token/token.module";
import { WordExamplesService } from "./word-examples.service";
import { WordLookupByWordService } from "./word-lookup-by-word.service";
import { WordPosService } from "./word-pos.service";
import { WordsController } from "./words.controller";
import { WordsService } from "./words.service";

@Module({
  imports: [
    TokenModule,
    DictionaryModule,
    DictionaryCacheModule,
    OnlineDictionaryModule,
    MorphologyModule,
    TokenizerModule,
    UnknownWordModule,
  ],
  controllers: [WordsController],
  providers: [
    WordsService,
    WordLookupByWordService,
    WordExamplesService,
    WordPosService,
    PrismaService,
  ],
})
export class WordsModule {}
