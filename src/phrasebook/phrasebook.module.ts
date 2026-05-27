import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { TokenModule } from "src/token/token.module";
import { PhrasebookController } from "./phrasebook.controller";
import { PhrasebookService } from "./phrasebook.service";
import { PhraseProgressService } from "./phrase-progress.service";

@Module({
  imports: [TokenModule],
  controllers: [PhrasebookController],
  providers: [PhrasebookService, PhraseProgressService, PrismaService],
})
export class PhrasebookModule {}
