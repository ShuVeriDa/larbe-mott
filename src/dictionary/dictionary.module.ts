import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { TokenModule } from "src/token/token.module";
import { DictionaryController } from "./dictionary.controller";
import { DictionaryService } from "./dictionary.service";
import { FoldersService } from "./folders.service";

@Module({
  imports: [TokenModule],
  controllers: [DictionaryController],
  providers: [DictionaryService, PrismaService, FoldersService],
})
export class DictionaryModule {}
