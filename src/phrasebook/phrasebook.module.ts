import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { TokenModule } from "src/token/token.module";
import { PhrasebookController } from "./phrasebook.controller";
import { PhrasebookService } from "./phrasebook.service";

@Module({
  imports: [TokenModule],
  controllers: [PhrasebookController],
  providers: [PhrasebookService, PrismaService],
})
export class PhrasebookModule {}
