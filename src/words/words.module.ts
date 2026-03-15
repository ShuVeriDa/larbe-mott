import { Module } from "@nestjs/common";
import { DictionaryCacheModule } from "src/markup-engine/dictionary-cache/dictionary-cache.module";
import { DictionaryModule } from "src/markup-engine/dictionary/dictionary.module";
import { MorphologyModule } from "src/markup-engine/morphology/morphology.module";
import { OnlineDictionaryModule } from "src/markup-engine/online-dictionary/online-dictionary.module";
import { PrismaService } from "src/prisma.service";
import { TokenModule } from "src/token/token.module";
import { WordLookupByWordService } from "./word-lookup-by-word.service";
import { WordsController } from "./words.controller";
import { WordsService } from "./words.service";

@Module({
  imports: [
    TokenModule,
    DictionaryModule,
    DictionaryCacheModule,
    OnlineDictionaryModule,
    MorphologyModule,
  ],
  controllers: [WordsController],
  providers: [WordsService, WordLookupByWordService, PrismaService],
})
export class WordsModule {}
