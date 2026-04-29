import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { TokenModule } from "src/token/token.module";
import { WordProgressModule } from "src/progress/word-progress/word-progress.module";
import { DictionaryController } from "./dictionary.controller";
import { DictionaryService } from "./dictionary.service";
import { FoldersService } from "./folders.service";

@Module({
  imports: [TokenModule, WordProgressModule],
  controllers: [DictionaryController],
  providers: [DictionaryService, PrismaService, FoldersService],
})
export class DictionaryModule {}
